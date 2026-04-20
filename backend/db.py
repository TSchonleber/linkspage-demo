"""Database client + query helpers for libSQL (Turso).

The client is the sync variant from `libsql-client` — simple and
serverless-friendly. When `TURSO_DATABASE_URL` is unset we fall back to
a local SQLite file (`file:local.db`) so tests and offline dev don't
require a Turso account.

All query helpers are small, explicit functions. They accept a client
argument rather than reaching for a global, which keeps tests trivial
to isolate via FastAPI's `dependency_overrides`.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import TYPE_CHECKING

from libsql_client import ClientSync, create_client_sync

from backend.models import Page

if TYPE_CHECKING:  # pragma: no cover
    pass

# Repo root = parent of backend/. Migrations sit next to backend/.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_MIGRATION_FILE = _REPO_ROOT / "migrations" / "0001_init.sql"
_DEFAULT_LOCAL_DB = f"file:{_REPO_ROOT / 'local.db'}"


def get_client() -> ClientSync:
    """Build a libSQL sync client from env vars.

    Falls back to a local SQLite file when `TURSO_DATABASE_URL` is missing,
    which lets the test suite and `vercel dev` run without network or secrets.
    """
    url = os.environ.get("TURSO_DATABASE_URL", "").strip()
    token = os.environ.get("TURSO_AUTH_TOKEN", "").strip()
    if not url:
        return create_client_sync(url=_DEFAULT_LOCAL_DB)
    if token:
        return create_client_sync(url=url, auth_token=token)
    return create_client_sync(url=url)


def _split_statements(sql: str) -> list[str]:
    """Split a SQL file on `;` boundaries after stripping `--` line comments.

    Comments must be stripped first — a `;` inside a `-- ...` comment would
    otherwise split one statement into two, leaving the second half of the
    comment as a phantom statement body.
    """
    cleaned_lines: list[str] = []
    for line in sql.splitlines():
        idx = line.find("--")
        if idx >= 0:
            line = line[:idx]
        cleaned_lines.append(line)
    cleaned = "\n".join(cleaned_lines)
    return [stmt.strip() for stmt in cleaned.split(";") if stmt.strip()]


def init_schema(client: ClientSync, migration_path: Path | None = None) -> None:
    """Execute the schema migration file statement-by-statement.

    ClientSync.execute only supports one statement at a time, so we split on
    `;`. `CREATE ... IF NOT EXISTS` makes this idempotent.
    """
    path = migration_path or _MIGRATION_FILE
    sql = path.read_text(encoding="utf-8")
    for stmt in _split_statements(sql):
        client.execute(stmt)


def _now_ms() -> int:
    """Wall-clock unix milliseconds. Matches what the schema stores."""
    return time.time_ns() // 1_000_000


def create_page(
    client: ClientSync, slug: str, token_hash: str, page: Page
) -> None:
    """Insert a new page row. Caller owns slug uniqueness (nanoid retry is their job)."""
    now = _now_ms()
    client.execute(
        "INSERT INTO pages (slug, edit_token_h, data, created_at, updated_at, view_count) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        [slug, token_hash, page.model_dump_json(), now, now],
    )


def get_page(client: ClientSync, slug: str) -> tuple[Page, str] | None:
    """Fetch a page + its stored token hash. Returns None on miss."""
    result = client.execute(
        "SELECT data, edit_token_h FROM pages WHERE slug = ?",
        [slug],
    )
    if not result.rows:
        return None
    row = result.rows[0]
    page = Page.model_validate_json(row["data"])
    return page, row["edit_token_h"]


def get_edit_token_hash(client: ClientSync, slug: str) -> str | None:
    """Lightweight lookup used by PUT before materializing the full page."""
    result = client.execute(
        "SELECT edit_token_h FROM pages WHERE slug = ?",
        [slug],
    )
    if not result.rows:
        return None
    return result.rows[0]["edit_token_h"]


def update_page(client: ClientSync, slug: str, page: Page) -> None:
    """Overwrite the `data` blob for an existing slug and bump updated_at."""
    client.execute(
        "UPDATE pages SET data = ?, updated_at = ? WHERE slug = ?",
        [page.model_dump_json(), _now_ms(), slug],
    )


def delete_page(client: ClientSync, slug: str) -> bool:
    """Delete a page. Returns True if a row was removed, False if slug was unknown."""
    # libSQL exposes `rows_affected` on the result.
    result = client.execute("DELETE FROM pages WHERE slug = ?", [slug])
    return bool(getattr(result, "rows_affected", 0))


def bump_view(client: ClientSync, slug: str) -> None:
    """Fire-and-forget view count increment. Errors are swallowed — a lost
    bump is far less bad than a 500 on the public read path."""
    try:
        client.execute(
            "UPDATE pages SET view_count = view_count + 1 WHERE slug = ?",
            [slug],
        )
    except Exception:  # noqa: BLE001 — intentional: never fail a GET on telemetry
        pass
