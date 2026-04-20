"""Pages CRUD routes.

Surface: `POST /api/pages`, `GET|PUT|DELETE /api/pages/{slug}`.
See `docs/specs/2026-04-19-link-in-bio-builder-design.md` §8.

Design choices:
- The `get_db` dependency returns a libSQL client; tests override it with
  a per-test tempfile client via `app.dependency_overrides`.
- POST route path is `""` (not `"/"`) so `/api/pages` lands without a 307.
- Rate-limit is an in-process dict keyed by client IP, pruned on read.
  Honors `RATE_LIMIT_ENFORCE`: when unset/0 we log a warning instead of
  blocking (explicit demo-day escape hatch from the plan).
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from libsql_client import ClientSync

from backend import db as dbmod
from backend.models import CreatePageResponse, Page, UpdatePageRequest
from backend.security import hash_token, make_edit_token, verify_token
from backend.slug import make_slug

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pages", tags=["pages"])


# ---------------------------------------------------------------------------
# Dependency: database client
# ---------------------------------------------------------------------------


def get_db() -> ClientSync:
    """Return a libSQL client for this request.

    Tests override this via `app.dependency_overrides[get_db]` to inject a
    per-test tempfile client; production uses the env-var-driven default.
    """
    return dbmod.get_client()


# ---------------------------------------------------------------------------
# In-memory rate limiter (POST only)
# ---------------------------------------------------------------------------

_RATE_WINDOW_SEC = 60 * 60  # 1 hour
_RATE_MAX_REQUESTS = 10

_create_hits: dict[str, list[float]] = defaultdict(list)


def _rate_limit_enforced() -> bool:
    return os.environ.get("RATE_LIMIT_ENFORCE", "0").strip() == "1"


def _check_rate_limit(request: Request) -> None:
    """Enforce a simple per-IP rolling window on POST /api/pages."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    hits = _create_hits[client_ip]
    # Prune timestamps older than the window — keeps the dict bounded in
    # practice because idle IPs drop to empty lists on their next visit.
    fresh = [t for t in hits if now - t < _RATE_WINDOW_SEC]
    fresh.append(now)
    _create_hits[client_ip] = fresh

    if len(fresh) > _RATE_MAX_REQUESTS:
        if _rate_limit_enforced():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="rate limit exceeded (10/hour per ip)",
            )
        logger.warning(
            "rate limit exceeded for %s (%d hits) but RATE_LIMIT_ENFORCE!=1, allowing",
            client_ip,
            len(fresh),
        )


def _reset_rate_limit_for_tests() -> None:
    """Test hook: flush the rate-limiter state between test runs."""
    _create_hits.clear()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("", response_model=CreatePageResponse, status_code=status.HTTP_201_CREATED)
def create_page(
    page: Page,
    request: Request,
    client: Annotated[ClientSync, Depends(get_db)],
) -> CreatePageResponse:
    """Mint a new page, returning the raw edit_token exactly once."""
    _check_rate_limit(request)

    slug = make_slug()
    raw_token = make_edit_token()
    token_hash = hash_token(raw_token)

    # Slug collision retries: tiny probability at 32^8 but cheap to defend.
    for _ in range(4):
        try:
            dbmod.create_page(client, slug, token_hash, page)
            break
        except Exception as exc:  # noqa: BLE001 — unique-constraint collision or similar
            logger.info("create_page retrying after error: %s", exc)
            slug = make_slug()
    else:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="could not mint unique slug",
        )

    return CreatePageResponse(slug=slug, edit_token=raw_token, page=page)


@router.get("/{slug}", response_model=Page)
def read_page(
    slug: str,
    background: BackgroundTasks,
    client: Annotated[ClientSync, Depends(get_db)],
) -> Page:
    """Return the page JSON; increment view_count after responding."""
    row = dbmod.get_page(client, slug)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    page, _ = row
    # BackgroundTasks fires after the response is sent — the client never
    # waits on the view-count write.
    background.add_task(dbmod.bump_view, client, slug)
    return page


@router.put("/{slug}", response_model=Page)
def replace_page(
    slug: str,
    page: UpdatePageRequest,
    client: Annotated[ClientSync, Depends(get_db)],
    x_edit_token: Annotated[str | None, Header(alias="X-Edit-Token")] = None,
) -> Page:
    """Update a page in place, gated by the raw edit token."""
    if not x_edit_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="missing edit token"
        )
    stored_hash = dbmod.get_edit_token_hash(client, slug)
    if stored_hash is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if not verify_token(x_edit_token, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="invalid edit token"
        )
    dbmod.update_page(client, slug, page)
    return page


@router.delete("/{slug}")
def admin_delete_page(
    slug: str,
    client: Annotated[ClientSync, Depends(get_db)],
    x_admin_key: Annotated[str | None, Header(alias="X-Admin-Key")] = None,
) -> Response:
    """Ops-only takedown. Requires `X-Admin-Key` to match `ADMIN_DELETE_KEY` env."""
    expected = os.environ.get("ADMIN_DELETE_KEY", "").strip()
    if not expected or not x_admin_key or x_admin_key != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="admin key required"
        )
    removed = dbmod.delete_page(client, slug)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
