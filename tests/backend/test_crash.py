"""End-to-end tests for /api/crash/*.

Mirrors the fixture pattern in test_pages.py:
- per-test tempfile libSQL DB
- dependency_overrides on `get_db`
- `_run` helper to drive async coroutines without pytest-asyncio

Time injection: both `backend.routes.crash._now_ms` and
`backend.crash.scheduler._default_now_ms` are monkeypatched to a clock
object whose value we advance manually. The scheduler reads its clock
via a function parameter (`now_ms_fn`), and the route layer passes
`_now_ms` — so patching the route's `_now_ms` global is sufficient.
"""

from __future__ import annotations

import asyncio
import hashlib
import sys
import tempfile
import uuid
from collections.abc import Awaitable, Callable, Iterator
from pathlib import Path
from typing import Any, TypeVar

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from libsql_client import create_client_sync  # noqa: E402

from backend.app import app  # noqa: E402
from backend.crash import hash_chain  # noqa: E402
from backend.db import init_schema  # noqa: E402
from backend.routes import crash as crash_routes  # noqa: E402

T = TypeVar("T")


def _run(coro: Awaitable[T]) -> T:
    return asyncio.run(coro)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Mutable clock
# ---------------------------------------------------------------------------


class Clock:
    """A hand-cranked clock used as the `now_ms` source during tests."""

    def __init__(self, start_ms: int = 1_700_000_000_000) -> None:
        self.ms = start_ms

    def now(self) -> int:
        return self.ms

    def advance(self, delta_ms: int) -> None:
        self.ms += delta_ms


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_path() -> Iterator[Path]:
    tmp = Path(tempfile.gettempdir()) / f"linkspage-crash-test-{uuid.uuid4().hex}.db"
    try:
        yield tmp
    finally:
        for p in (tmp, tmp.with_suffix(tmp.suffix + "-wal"), tmp.with_suffix(tmp.suffix + "-shm")):
            try:
                p.unlink()
            except FileNotFoundError:
                pass


@pytest.fixture()
def client_factory(db_path: Path) -> Iterator[Callable[[], Any]]:
    url = f"file:{db_path}"
    bootstrap = create_client_sync(url=url)
    # Apply both migrations so the crash tables are in place.
    init_schema(bootstrap, _REPO_ROOT / "migrations" / "0001_init.sql")
    init_schema(bootstrap, _REPO_ROOT / "migrations" / "0002_crash_tables.sql")
    bootstrap.close()

    def make() -> Any:
        return create_client_sync(url=url)

    yield make


@pytest.fixture()
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    """Install a hand-cranked clock as the route-layer time source."""
    c = Clock()
    monkeypatch.setattr(crash_routes, "_now_ms", c.now)
    return c


@pytest.fixture()
def http(
    client_factory: Callable[[], Any], clock: Clock
) -> Iterator[AsyncClient]:
    def _override() -> Any:
        return client_factory()

    app.dependency_overrides[crash_routes.get_db] = _override
    try:
        transport = ASGITransport(app=app)
        client = AsyncClient(transport=transport, base_url="http://testserver")
        yield client
        _run(client.aclose())
    finally:
        app.dependency_overrides.pop(crash_routes.get_db, None)


# ---------------------------------------------------------------------------
# Raw DB helper — some tests manipulate state directly
# ---------------------------------------------------------------------------


def _direct_client(db_path: Path) -> Any:
    return create_client_sync(url=f"file:{db_path}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_first_round_auto_starts(http: AsyncClient) -> None:
    """GET /current on a fresh DB mints round 1 in the betting phase."""

    async def go() -> None:
        resp = await http.get("/api/crash/current")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["round_id"] == 1
        assert data["status"] == "betting"
        assert data["betting_ends_ms"] > data["server_time_ms"]
        assert data["committed_hash"]
        # Pre-crash: crash_at_ms and revealed_seed must NOT leak.
        assert "crash_at_ms" not in data
        assert "revealed_seed" not in data
        assert data["bets"] == []

    _run(go())


def test_bet_in_betting_phase_ok(http: AsyncClient) -> None:
    """POST /bet during betting works; repeat bet same round = 409."""

    async def go() -> None:
        cur = (await http.get("/api/crash/current")).json()
        rid = cur["round_id"]

        resp = await http.post(
            "/api/crash/bet",
            json={"round_id": rid, "player_pubkey": "alice", "bet_lamports": 1000},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["bet_id"] >= 1

        dupe = await http.post(
            "/api/crash/bet",
            json={"round_id": rid, "player_pubkey": "alice", "bet_lamports": 500},
        )
        assert dupe.status_code == 409

    _run(go())


def test_bet_rejected_in_running_phase(
    http: AsyncClient, clock: Clock, db_path: Path
) -> None:
    """Bets after betting phase ends are rejected with 403.

    Jumping a blanket 15s would also blow past some rounds' crash_at
    (MIN_RUN_MS can be as low as 500ms for a ~1.00x round), which would
    auto-advance into a NEW round and produce 409 not 403. So we peek at
    `crash_at_ms` and land squarely inside the running phase.
    """

    async def go() -> None:
        cur = (await http.get("/api/crash/current")).json()
        rid = cur["round_id"]

        raw = _direct_client(db_path)
        row = raw.execute(
            "SELECT running_starts_ms, crash_at_ms FROM crash_rounds WHERE round_id = ?",
            [rid],
        ).rows[0]
        raw.close()
        running_starts = int(row["running_starts_ms"])
        crash_at = int(row["crash_at_ms"])
        # Pick a timestamp strictly inside the running phase.
        clock.ms = running_starts + max(1, (crash_at - running_starts) // 2)

        resp = await http.post(
            "/api/crash/bet",
            json={"round_id": rid, "player_pubkey": "bob", "bet_lamports": 1000},
        )
        assert resp.status_code == 403, resp.text

    _run(go())


def test_cashout_during_running_pays(
    http: AsyncClient, clock: Clock, db_path: Path
) -> None:
    """Place bet → advance to running → cashout → payout = bet * mult/100."""

    async def go() -> None:
        cur = (await http.get("/api/crash/current")).json()
        rid = cur["round_id"]

        bet_resp = await http.post(
            "/api/crash/bet",
            json={"round_id": rid, "player_pubkey": "carol", "bet_lamports": 1000},
        )
        assert bet_resp.status_code == 201
        bet_id = bet_resp.json()["bet_id"]

        # Peek at the stored crash_at_ms to pick a safe pre-crash timestamp.
        raw = _direct_client(db_path)
        row = raw.execute(
            "SELECT betting_ends_ms, running_starts_ms, crash_at_ms, "
            "crash_multiplier_x100 FROM crash_rounds WHERE round_id = ?",
            [rid],
        ).rows[0]
        raw.close()
        running_starts = int(row["running_starts_ms"])
        crash_at = int(row["crash_at_ms"])
        crash_mult_x100 = int(row["crash_multiplier_x100"])
        # Cash out just after running starts — far from the crash boundary.
        target = running_starts + min(100, max(1, (crash_at - running_starts) // 4))
        clock.ms = target

        co = await http.post(
            "/api/crash/cashout",
            json={"bet_id": bet_id, "player_pubkey": "carol"},
        )
        assert co.status_code == 200, co.text
        body = co.json()
        # Payout exact: bet_lamports * mult_x100 // 100
        assert body["payout_lamports"] == (1000 * body["cashout_multiplier_x100"]) // 100
        # Multiplier must be at least 1.00x and no more than the terminal crash.
        assert 100 <= body["cashout_multiplier_x100"] <= crash_mult_x100

    _run(go())


def test_cashout_after_crash_too_late(
    http: AsyncClient, clock: Clock, db_path: Path
) -> None:
    """Bet → advance past crash_at_ms → cashout returns 410."""

    async def go() -> None:
        cur = (await http.get("/api/crash/current")).json()
        rid = cur["round_id"]
        bet = (
            await http.post(
                "/api/crash/bet",
                json={"round_id": rid, "player_pubkey": "dave", "bet_lamports": 2000},
            )
        ).json()

        # Read crash_at for this round and jump past it.
        raw = _direct_client(db_path)
        crash_at = int(
            raw.execute(
                "SELECT crash_at_ms FROM crash_rounds WHERE round_id = ?", [rid]
            ).rows[0]["crash_at_ms"]
        )
        raw.close()
        clock.ms = crash_at + 10

        co = await http.post(
            "/api/crash/cashout",
            json={"bet_id": bet["bet_id"], "player_pubkey": "dave"},
        )
        assert co.status_code == 410, co.text

    _run(go())


def test_provably_fair_seed_verifies(
    http: AsyncClient, clock: Clock, db_path: Path
) -> None:
    """After crash: sha256(revealed_seed) must match the stored committed_hash,
    and crash_from_seed(revealed) must equal the stored crash_multiplier_x100."""

    async def go() -> None:
        cur = (await http.get("/api/crash/current")).json()
        rid = cur["round_id"]
        committed_hash = cur["committed_hash"]

        # Jump past the round's crash_at.
        raw = _direct_client(db_path)
        crash_at = int(
            raw.execute(
                "SELECT crash_at_ms FROM crash_rounds WHERE round_id = ?", [rid]
            ).rows[0]["crash_at_ms"]
        )
        raw.close()
        clock.ms = crash_at + 50

        # Force a tick — GET /current will crash the round and mint a
        # new one. We then read the OLD round's revealed_seed directly.
        _ = (await http.get("/api/crash/current")).json()

        raw = _direct_client(db_path)
        row = raw.execute(
            "SELECT revealed_seed, crash_multiplier_x100 FROM crash_rounds "
            "WHERE round_id = ?",
            [rid],
        ).rows[0]
        raw.close()
        revealed_hex = row["revealed_seed"]
        stored_x100 = int(row["crash_multiplier_x100"])
        assert revealed_hex, "seed should be revealed post-crash"
        seed = bytes.fromhex(revealed_hex)

        # Commitment check: committed_hash == sha256(seed).
        assert hashlib.sha256(seed).hexdigest() == committed_hash

        # Derivation check: round-trip via the public helper.
        assert hash_chain.crash_from_seed(seed) == stored_x100

    _run(go())
