"""End-to-end tests for /api/pages/*.

We use `httpx.ASGITransport` against the FastAPI app. The `get_db` dependency
is overridden per test with a libSQL client pointing at a unique tempfile —
this keeps tests isolated without requiring Turso or env-var mutation.

Tests are sync functions that drive an inner async coroutine via
`asyncio.run(...)` so we don't need `pytest-asyncio` (not installed).
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
import uuid
from collections.abc import Awaitable, Callable, Iterator
from pathlib import Path
from typing import Any, TypeVar

# Ensure the repo root is importable before we touch `backend.*`.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from libsql_client import create_client_sync  # noqa: E402

from backend.app import app  # noqa: E402
from backend.db import init_schema  # noqa: E402
from backend.routes.pages import _reset_rate_limit_for_tests, get_db  # noqa: E402

T = TypeVar("T")


def _run(coro: Awaitable[T]) -> T:
    """Sync wrapper around an async coroutine (no pytest-asyncio needed)."""
    return asyncio.run(coro)  # type: ignore[arg-type]


@pytest.fixture()
def db_path() -> Iterator[Path]:
    """Per-test tempfile SQLite DB. Cleaned up after the test."""
    tmp = Path(tempfile.gettempdir()) / f"linkspage-test-{uuid.uuid4().hex}.db"
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
    """Build libSQL clients pointed at the per-test tempfile.

    We return a factory rather than a single client because FastAPI's
    dependency system calls `get_db` once per request — using one shared
    client per request works, but creating fresh ones mirrors production
    more closely and avoids any lingering cursor state.
    """
    url = f"file:{db_path}"
    # Seed the schema once using a bootstrap client.
    bootstrap = create_client_sync(url=url)
    init_schema(bootstrap)
    bootstrap.close()

    def make() -> Any:
        return create_client_sync(url=url)

    yield make


@pytest.fixture()
def http(client_factory: Callable[[], Any]) -> Iterator[AsyncClient]:
    """Async HTTP client bound to the FastAPI app with get_db overridden."""
    _reset_rate_limit_for_tests()

    def _override() -> Any:
        return client_factory()

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        client = AsyncClient(transport=transport, base_url="http://testserver")
        yield client
        _run(client.aclose())
    finally:
        app.dependency_overrides.pop(get_db, None)


def _valid_page(**overrides: Any) -> dict[str, Any]:
    base = {
        "version": 1,
        "name": "Ada",
        "bio": "Enchantress of numbers",
        "avatar": "",
        "theme": "minimal",
        "links": [
            {"id": "l1", "label": "Site", "url": "https://example.com", "enabled": True},
        ],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_create_and_get(http: AsyncClient) -> None:
    """Round-trip: POST mints a slug + token; GET returns the same page."""

    async def go() -> None:
        body = _valid_page()
        resp = await http.post("/api/pages", json=body)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["slug"] and len(data["slug"]) == 8
        assert data["edit_token"]
        assert data["page"]["name"] == "Ada"

        got = await http.get(f"/api/pages/{data['slug']}")
        assert got.status_code == 200
        assert got.json()["name"] == "Ada"
        assert got.json()["links"][0]["url"] == "https://example.com"

    _run(go())


def test_put_with_correct_token(http: AsyncClient) -> None:
    """PUT with the right token updates the page."""

    async def go() -> None:
        resp = await http.post("/api/pages", json=_valid_page())
        body = resp.json()
        slug, token = body["slug"], body["edit_token"]

        updated = _valid_page(name="Grace", bio="Rear admiral")
        put = await http.put(
            f"/api/pages/{slug}",
            json=updated,
            headers={"X-Edit-Token": token},
        )
        assert put.status_code == 200
        assert put.json()["name"] == "Grace"

        got = await http.get(f"/api/pages/{slug}")
        assert got.json()["name"] == "Grace"

    _run(go())


def test_put_with_wrong_token_403(http: AsyncClient) -> None:
    """PUT with a bogus token is rejected with 403."""

    async def go() -> None:
        resp = await http.post("/api/pages", json=_valid_page())
        slug = resp.json()["slug"]

        put = await http.put(
            f"/api/pages/{slug}",
            json=_valid_page(name="Mallory"),
            headers={"X-Edit-Token": "not-the-real-token"},
        )
        assert put.status_code == 403

    _run(go())


def test_put_missing_token_403(http: AsyncClient) -> None:
    """PUT without the header is rejected before we even query the DB."""

    async def go() -> None:
        resp = await http.post("/api/pages", json=_valid_page())
        slug = resp.json()["slug"]
        put = await http.put(f"/api/pages/{slug}", json=_valid_page())
        assert put.status_code == 403

    _run(go())


def test_get_missing_404(http: AsyncClient) -> None:
    """Unknown slug returns 404."""

    async def go() -> None:
        got = await http.get("/api/pages/doesnotexist")
        assert got.status_code == 404

    _run(go())


def test_oversize_avatar_422(http: AsyncClient) -> None:
    """Avatar larger than the cap is rejected at validation (422)."""

    async def go() -> None:
        body = _valid_page(avatar="a" * 500_001)
        resp = await http.post("/api/pages", json=body)
        assert resp.status_code == 422

    _run(go())


def test_max_links_422(http: AsyncClient) -> None:
    """More than 50 links is rejected at validation (422)."""

    async def go() -> None:
        links = [
            {"id": f"l{i}", "label": f"l{i}", "url": "https://x", "enabled": True}
            for i in range(51)
        ]
        body = _valid_page(links=links)
        resp = await http.post("/api/pages", json=body)
        assert resp.status_code == 422

    _run(go())


def test_delete_requires_admin_key(http: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """DELETE: 403 without key, 403 with wrong key, 204 with correct key, 404 after."""

    async def go() -> None:
        resp = await http.post("/api/pages", json=_valid_page())
        slug = resp.json()["slug"]

        # No admin key configured server-side -> 403 even if header passed.
        monkeypatch.delenv("ADMIN_DELETE_KEY", raising=False)
        nokey = await http.delete(f"/api/pages/{slug}", headers={"X-Admin-Key": "anything"})
        assert nokey.status_code == 403

        # Configure admin key; wrong key -> 403.
        monkeypatch.setenv("ADMIN_DELETE_KEY", "s3cret")
        wrong = await http.delete(f"/api/pages/{slug}", headers={"X-Admin-Key": "nope"})
        assert wrong.status_code == 403

        # Correct key -> 204.
        ok = await http.delete(f"/api/pages/{slug}", headers={"X-Admin-Key": "s3cret"})
        assert ok.status_code == 204

        # Subsequent GET -> 404.
        gone = await http.get(f"/api/pages/{slug}")
        assert gone.status_code == 404

    _run(go())


def test_create_route_has_no_trailing_slash(http: AsyncClient) -> None:
    """Regression guard: POST /api/pages (no slash) must not 307 redirect."""

    async def go() -> None:
        resp = await http.post("/api/pages", json=_valid_page())
        # We expect a direct 201, not a redirect.
        assert resp.status_code == 201
        assert not (300 <= resp.status_code < 400)

    _run(go())
