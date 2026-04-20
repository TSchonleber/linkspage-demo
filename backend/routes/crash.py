"""Crash game HTTP surface: /api/crash/*.

Design notes:
- Round state is lazy: every GET to /current ticks the state machine via
  `scheduler.advance_round`. No background workers, no cron — suits
  Vercel Python's stateless model.
- Time is read exclusively through `_now_ms()` at module scope so tests
  can monkeypatch it in one place.
- The server is authoritative on cashout multipliers: we never trust a
  client-supplied timestamp.
"""

from __future__ import annotations

import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from libsql_client import ClientSync
from pydantic import BaseModel, Field

from backend import db as dbmod
from backend.crash import scheduler

router = APIRouter(prefix="/api/crash", tags=["crash"])


# ---------------------------------------------------------------------------
# Time source (test hook)
# ---------------------------------------------------------------------------


def _now_ms() -> int:
    """Wall-clock ms. Tests monkeypatch this symbol to control the clock."""
    return time.time_ns() // 1_000_000


# ---------------------------------------------------------------------------
# Dependency: database client
# ---------------------------------------------------------------------------


def get_db() -> ClientSync:
    """Return a libSQL client. Tests override via `app.dependency_overrides`."""
    return dbmod.get_client()


def _ensure_schema_ready(client: ClientSync) -> None:
    """Apply both migration files idempotently.

    Production runs the bootstrap once at process start, but because the
    crash tables live in a second migration file we re-run both here under
    CREATE ... IF NOT EXISTS semantics. Cheap and defensive.
    """
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[2]
    for fname in ("0001_init.sql", "0002_crash_tables.sql"):
        mig = repo_root / "migrations" / fname
        if mig.exists():
            dbmod.init_schema(client, mig)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class BetRequest(BaseModel):
    round_id: int
    player_pubkey: str = Field(min_length=1, max_length=128)
    bet_lamports: int = Field(gt=0)


class CashoutRequest(BaseModel):
    bet_id: int
    player_pubkey: str = Field(min_length=1, max_length=128)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _phase_for(round_row: dict[str, Any], now_ms: int) -> str:
    """Derive phase from timestamps so the response never lies about a
    stored-but-stale status."""
    if round_row["status"] == "crashed":
        return "crashed"
    if now_ms < round_row["betting_ends_ms"]:
        return "betting"
    if now_ms < round_row["crash_at_ms"]:
        return "running"
    return "crashed"


def _bets_for_round(client: ClientSync, round_id: int) -> list[dict[str, Any]]:
    res = client.execute(
        "SELECT bet_id, player_pubkey, bet_lamports, cashed_out_at_ms, "
        "cashout_multiplier_x100, payout_lamports, created_at_ms "
        "FROM crash_bets WHERE round_id = ? ORDER BY bet_id ASC",
        [round_id],
    )
    out: list[dict[str, Any]] = []
    for row in res.rows:
        out.append({
            "bet_id": int(row["bet_id"]),
            "player_pubkey": row["player_pubkey"],
            "bet_lamports": int(row["bet_lamports"]),
            "cashed_out_at_ms": (
                int(row["cashed_out_at_ms"]) if row["cashed_out_at_ms"] is not None else None
            ),
            "cashout_multiplier_x100": (
                int(row["cashout_multiplier_x100"])
                if row["cashout_multiplier_x100"] is not None
                else None
            ),
            "payout_lamports": (
                int(row["payout_lamports"]) if row["payout_lamports"] is not None else None
            ),
            "created_at_ms": int(row["created_at_ms"]),
        })
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/current")
def get_current(client: Annotated[ClientSync, Depends(get_db)]) -> dict[str, Any]:
    """Advance the state machine and return the active round.

    Reveals `crash_at_ms` + `revealed_seed` only once the round has
    crashed, so clients can't front-run the house.
    """
    _ensure_schema_ready(client)
    round_row = scheduler.advance_round(client, now_ms_fn=_now_ms)
    now_ms = _now_ms()
    phase = _phase_for(round_row, now_ms)

    resp: dict[str, Any] = {
        "round_id": round_row["round_id"],
        "status": phase,
        "betting_ends_ms": round_row["betting_ends_ms"],
        "running_starts_ms": round_row["running_starts_ms"],
        "server_time_ms": now_ms,
        "committed_hash": round_row["committed_hash"],
        "bets": _bets_for_round(client, round_row["round_id"]),
    }
    if phase == "crashed":
        resp["crash_at_ms"] = round_row["crash_at_ms"]
        resp["crash_multiplier_x100"] = round_row["crash_multiplier_x100"]
        resp["revealed_seed"] = round_row["revealed_seed"]
    return resp


@router.post("/bet", status_code=status.HTTP_201_CREATED)
def place_bet(
    body: BetRequest,
    client: Annotated[ClientSync, Depends(get_db)],
) -> dict[str, Any]:
    """Insert a bet for the active round. Betting phase only; one per player."""
    _ensure_schema_ready(client)
    # Tick so the stored row matches wall-clock phase.
    round_row = scheduler.advance_round(client, now_ms_fn=_now_ms)
    now_ms = _now_ms()

    if round_row["round_id"] != body.round_id:
        # Client is betting on a stale round.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="round_id no longer current",
        )

    phase = _phase_for(round_row, now_ms)
    if phase != "betting":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"betting closed (phase={phase})",
        )

    # One active bet per player per round.
    dupe = client.execute(
        "SELECT bet_id FROM crash_bets WHERE round_id = ? AND player_pubkey = ?",
        [body.round_id, body.player_pubkey],
    )
    if dupe.rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="player already bet this round",
        )

    res = client.execute(
        "INSERT INTO crash_bets (round_id, player_pubkey, bet_lamports, "
        "created_at_ms) VALUES (?, ?, ?, ?)",
        [body.round_id, body.player_pubkey, body.bet_lamports, now_ms],
    )
    bet_id = int(getattr(res, "last_insert_rowid", 0))
    if not bet_id:
        q = client.execute("SELECT MAX(bet_id) AS bid FROM crash_bets")
        bet_id = int(q.rows[0]["bid"])
    return {
        "bet_id": bet_id,
        "round_id": body.round_id,
        "player_pubkey": body.player_pubkey,
        "bet_lamports": body.bet_lamports,
    }


@router.post("/cashout")
def cashout(
    body: CashoutRequest,
    client: Annotated[ClientSync, Depends(get_db)],
) -> dict[str, Any]:
    """Server-authoritative cashout. Multiplier is computed from server now_ms.

    Status codes:
      403 - not in running phase (either still betting OR bet doesn't match player)
      404 - bet not found
      409 - already cashed out
      410 - too late; round already crashed
    """
    _ensure_schema_ready(client)
    # Tick first so a bet placed and then crashed-past reflects correctly.
    scheduler.advance_round(client, now_ms_fn=_now_ms)
    now_ms = _now_ms()

    res = client.execute(
        "SELECT bet_id, round_id, player_pubkey, bet_lamports, "
        "cashed_out_at_ms, cashout_multiplier_x100 "
        "FROM crash_bets WHERE bet_id = ?",
        [body.bet_id],
    )
    if not res.rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="bet not found")
    bet = res.rows[0]
    if bet["player_pubkey"] != body.player_pubkey:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="player does not own bet"
        )
    if bet["cashed_out_at_ms"] is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="already cashed out"
        )

    # Fetch the bet's round to decide phase.
    rr = client.execute(
        "SELECT round_id, committed_hash, revealed_seed, crash_multiplier_x100, "
        "betting_ends_ms, running_starts_ms, crash_at_ms, status, created_at_ms "
        "FROM crash_rounds WHERE round_id = ?",
        [int(bet["round_id"])],
    )
    if not rr.rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="round missing")
    round_row = scheduler._row_to_round(rr.rows[0])
    phase = _phase_for(round_row, now_ms)

    if phase == "betting":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round hasn't started"
        )
    if phase == "crashed":
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="round already crashed"
        )

    live_mult = scheduler.multiplier_now(round_row, now_ms)
    mult_x100 = int(round(live_mult * 100))
    if mult_x100 < 100:
        mult_x100 = 100  # floor at 1.00x
    payout = (int(bet["bet_lamports"]) * mult_x100) // 100

    client.execute(
        "UPDATE crash_bets SET cashed_out_at_ms = ?, cashout_multiplier_x100 = ?, "
        "payout_lamports = ? WHERE bet_id = ?",
        [now_ms, mult_x100, payout, body.bet_id],
    )
    return {
        "bet_id": body.bet_id,
        "round_id": int(bet["round_id"]),
        "cashout_multiplier_x100": mult_x100,
        "payout_lamports": payout,
        "cashed_out_at_ms": now_ms,
    }


@router.get("/history")
def history(client: Annotated[ClientSync, Depends(get_db)]) -> dict[str, Any]:
    """Last 20 crashed rounds with crash multiplier + cashout count."""
    _ensure_schema_ready(client)
    res = client.execute(
        "SELECT round_id, crash_multiplier_x100, revealed_seed, committed_hash, "
        "crash_at_ms FROM crash_rounds WHERE status = 'crashed' "
        "ORDER BY round_id DESC LIMIT 20"
    )
    rounds: list[dict[str, Any]] = []
    for row in res.rows:
        count_res = client.execute(
            "SELECT COUNT(*) AS c FROM crash_bets "
            "WHERE round_id = ? AND cashed_out_at_ms IS NOT NULL",
            [int(row["round_id"])],
        )
        cashout_count = int(count_res.rows[0]["c"]) if count_res.rows else 0
        rounds.append({
            "round_id": int(row["round_id"]),
            "crash_multiplier_x100": (
                int(row["crash_multiplier_x100"])
                if row["crash_multiplier_x100"] is not None
                else None
            ),
            "revealed_seed": row["revealed_seed"],
            "committed_hash": row["committed_hash"],
            "crash_at_ms": int(row["crash_at_ms"]),
            "cashout_count": cashout_count,
        })
    return {"rounds": rounds}
