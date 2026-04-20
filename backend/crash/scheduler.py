"""Stateless crash-round state machine.

Vercel Python functions don't get a persistent background loop, so round
progression is lazy: every request that reads `/api/crash/current` calls
`advance_round`, which:

  1. Ensures the provably-fair seed chain is populated.
  2. Reads the latest round (by `round_id DESC`).
  3. If no round exists or the latest is `crashed`, mints the next round,
     consuming the highest-unused seed from the chain.
  4. Otherwise, if `now_ms > crash_at_ms`, marks it `crashed` and reveals
     the seed, then recursively mints the successor so the caller always
     sees a live round.

All wall-clock reads funnel through a `now_ms_fn` parameter so tests can
freeze / advance time without touching `time.time()` globally.
"""

from __future__ import annotations

import hashlib
import math
import time
from collections.abc import Callable
from typing import Any

from libsql_client import ClientSync

from backend.crash import hash_chain

# Tunables — test-friendly defaults.
BETTING_PHASE_MS = 10_000
E_FOLD_MS = 6_000          # 6s to e-fold; matches spec's `exp(dt/6000)`.
MIN_RUN_MS = 500           # floor so a degenerate ~1.0x round still has a blip
CHAIN_LENGTH = 1_000


# ---------------------------------------------------------------------------
# Time source
# ---------------------------------------------------------------------------

def _default_now_ms() -> int:
    return time.time_ns() // 1_000_000


NowFn = Callable[[], int]


# ---------------------------------------------------------------------------
# Seed-chain bootstrap
# ---------------------------------------------------------------------------


def ensure_chain_initialized(client: ClientSync, length: int = CHAIN_LENGTH) -> None:
    """Populate `crash_seed_chain` once. No-op if already seeded."""
    res = client.execute("SELECT COUNT(*) AS n FROM crash_seed_chain")
    if res.rows and int(res.rows[0]["n"]) > 0:
        return
    chain = hash_chain.generate_chain(length)
    for i, seed in enumerate(chain):
        client.execute(
            "INSERT INTO crash_seed_chain (idx, seed_hex, consumed_by_round) VALUES (?, ?, NULL)",
            [i, seed.hex()],
        )


def _next_unused_seed(client: ClientSync) -> tuple[int, bytes]:
    """Return (idx, seed_bytes) for the highest-idx unused chain entry."""
    res = client.execute(
        "SELECT idx, seed_hex FROM crash_seed_chain "
        "WHERE consumed_by_round IS NULL ORDER BY idx DESC LIMIT 1"
    )
    if not res.rows:
        raise RuntimeError("crash seed chain exhausted")
    row = res.rows[0]
    return int(row["idx"]), bytes.fromhex(row["seed_hex"])


# ---------------------------------------------------------------------------
# Round helpers
# ---------------------------------------------------------------------------


def _row_to_round(row: Any) -> dict[str, Any]:
    return {
        "round_id": int(row["round_id"]),
        "committed_hash": row["committed_hash"],
        "revealed_seed": row["revealed_seed"],
        "crash_multiplier_x100": (
            int(row["crash_multiplier_x100"])
            if row["crash_multiplier_x100"] is not None
            else None
        ),
        "betting_ends_ms": int(row["betting_ends_ms"]),
        "running_starts_ms": int(row["running_starts_ms"]),
        "crash_at_ms": int(row["crash_at_ms"]),
        "status": row["status"],
        "created_at_ms": int(row["created_at_ms"]),
    }


def _latest_round(client: ClientSync) -> dict[str, Any] | None:
    res = client.execute(
        "SELECT round_id, committed_hash, revealed_seed, crash_multiplier_x100, "
        "betting_ends_ms, running_starts_ms, crash_at_ms, status, created_at_ms "
        "FROM crash_rounds ORDER BY round_id DESC LIMIT 1"
    )
    if not res.rows:
        return None
    return _row_to_round(res.rows[0])


def _compute_delay_ms(crash_multiplier_x100: int) -> int:
    """Invert `mult = exp(dt / E_FOLD_MS)` for `dt`. Floor at MIN_RUN_MS."""
    mult = max(1.00, crash_multiplier_x100 / 100)
    dt = int(E_FOLD_MS * math.log(mult))
    return max(MIN_RUN_MS, dt)


def _mint_round(client: ClientSync, now_ms: int) -> dict[str, Any]:
    """Create the next round by consuming the highest unused seed."""
    idx, seed = _next_unused_seed(client)
    committed_hash = hashlib.sha256(seed).hexdigest()
    crash_x100 = hash_chain.crash_from_seed(seed)

    betting_ends = now_ms + BETTING_PHASE_MS
    running_starts = betting_ends
    crash_at = running_starts + _compute_delay_ms(crash_x100)

    res = client.execute(
        "INSERT INTO crash_rounds (committed_hash, revealed_seed, "
        "crash_multiplier_x100, betting_ends_ms, running_starts_ms, "
        "crash_at_ms, status, created_at_ms) "
        "VALUES (?, NULL, ?, ?, ?, ?, 'betting', ?)",
        [committed_hash, crash_x100, betting_ends, running_starts, crash_at, now_ms],
    )
    # libSQL returns last_insert_rowid on the result.
    round_id = int(getattr(res, "last_insert_rowid", 0))
    if not round_id:
        # Fallback: read it back. (Shouldn't normally fire.)
        q = client.execute("SELECT MAX(round_id) AS rid FROM crash_rounds")
        round_id = int(q.rows[0]["rid"])

    # Reserve the seed against this round but DO NOT reveal seed_hex yet —
    # `seed_hex` stays in the chain table; we reveal it into
    # `crash_rounds.revealed_seed` at crash time.
    client.execute(
        "UPDATE crash_seed_chain SET consumed_by_round = ? WHERE idx = ?",
        [round_id, idx],
    )
    return _latest_round(client)  # type: ignore[return-value]


def _crash_round(client: ClientSync, round_row: dict[str, Any]) -> None:
    """Mark a round crashed and reveal its seed.

    Finds the chain entry pinned to this round and copies its seed_hex into
    `crash_rounds.revealed_seed`. Idempotent-ish: callers guard on status.
    """
    res = client.execute(
        "SELECT seed_hex FROM crash_seed_chain WHERE consumed_by_round = ?",
        [round_row["round_id"]],
    )
    seed_hex = res.rows[0]["seed_hex"] if res.rows else None
    client.execute(
        "UPDATE crash_rounds SET status = 'crashed', revealed_seed = ? WHERE round_id = ?",
        [seed_hex, round_row["round_id"]],
    )
    # Also settle any bets that never cashed out: zero payout, no multiplier.
    # We leave them in place for /history; this is just explicit bookkeeping.


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def advance_round(
    client: ClientSync,
    now_ms_fn: NowFn = _default_now_ms,
) -> dict[str, Any]:
    """Core state-machine tick. Returns the currently-active round.

    The post-condition is: returned round is either `betting` or `running`
    (never `crashed`). If the latest stored round is crashed, we mint a
    fresh one before returning.
    """
    ensure_chain_initialized(client)

    now_ms = now_ms_fn()
    current = _latest_round(client)

    if current is None:
        return _mint_round(client, now_ms)

    if current["status"] == "crashed":
        return _mint_round(client, now_ms)

    # In-flight round: did it cross the crash boundary?
    if now_ms >= current["crash_at_ms"]:
        _crash_round(client, current)
        return _mint_round(client, now_ms)

    # Still pre-crash. Promote betting→running if the betting phase ended.
    if current["status"] == "betting" and now_ms >= current["running_starts_ms"]:
        client.execute(
            "UPDATE crash_rounds SET status = 'running' WHERE round_id = ?",
            [current["round_id"]],
        )
        current["status"] = "running"

    return current


def multiplier_now(round_row: dict[str, Any], now_ms: int) -> float:
    """Live multiplier for a running round, clamped to [1.00, crash].

    During betting we return 1.00 (no action yet). Past crash_at we return
    the terminal multiplier — callers should really not be calling this
    post-crash, but it's convenient for UI rendering races.
    """
    crash_mult = max(1.00, (round_row["crash_multiplier_x100"] or 100) / 100)
    if now_ms < round_row["running_starts_ms"]:
        return 1.00
    if now_ms >= round_row["crash_at_ms"]:
        return crash_mult
    dt = now_ms - round_row["running_starts_ms"]
    live = math.exp(dt / E_FOLD_MS)
    if live < 1.00:
        return 1.00
    if live > crash_mult:
        return crash_mult
    return live
