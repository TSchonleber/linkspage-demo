"""Contract tests for Pydantic models.

These guard the shape of the JSON payload the frontend (`lib/types.ts`,
`lib/schema.ts`) depends on. The schema snapshot is the primary drift
detector — regenerate deliberately when the spec changes.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Ensure the repo root is importable when pytest is invoked without a
# pre-existing `pythonpath` config. Must run before `from backend...`.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from backend.models import CreatePageResponse, Link, Page  # noqa: E402

SNAPSHOT_DIR = Path(__file__).parent / "__snapshots__"
PAGE_SCHEMA_SNAPSHOT = SNAPSHOT_DIR / "page.schema.json"


def _make_links(n: int) -> list[Link]:
    return [
        Link(id=f"l{i:03d}", label=f"Link {i}", url=f"https://example.com/{i}")
        for i in range(n)
    ]


def test_empty_page_round_trip() -> None:
    """A minimal Page with only `name` set survives JSON round-trip."""
    page = Page(name="Ada")
    dumped = page.model_dump_json()
    restored = Page.model_validate_json(dumped)
    assert restored == page
    assert restored.version == 1
    assert restored.theme == "minimal"
    assert restored.links == []


def test_full_page_round_trip() -> None:
    """50-link page — the documented maximum — round-trips cleanly."""
    page = Page(
        name="Ada Lovelace",
        bio="Enchantress of numbers",
        avatar="",
        theme="neon",
        links=_make_links(50),
    )
    restored = Page.model_validate_json(page.model_dump_json())
    assert restored == page
    assert len(restored.links) == 50


def test_oversize_avatar_rejected() -> None:
    """Avatar length cap is a hard constraint (prevents DB row bloat)."""
    with pytest.raises(ValidationError):
        Page(name="x", avatar="a" * 500_001)


def test_too_many_links_rejected() -> None:
    """51 links exceeds the documented cap."""
    with pytest.raises(ValidationError):
        Page(name="x", links=_make_links(51))


def test_link_label_bounds() -> None:
    """Empty labels are rejected; oversize labels are rejected."""
    with pytest.raises(ValidationError):
        Link(id="l1", label="", url="https://example.com")
    with pytest.raises(ValidationError):
        Link(id="l1", label="x" * 81, url="https://example.com")


def test_create_page_response_shape() -> None:
    """Contract check: response carries slug, edit_token, echoed page."""
    page = Page(name="x")
    resp = CreatePageResponse(slug="abcd1234", edit_token="raw-token", page=page)
    assert resp.slug == "abcd1234"
    assert resp.edit_token == "raw-token"
    assert resp.page == page


def test_page_schema_snapshot() -> None:
    """Snapshot the JSON schema so TS-side drift gets caught in CI.

    On first run we write the snapshot. On subsequent runs we compare.
    To intentionally update: delete the file (or set UPDATE_SNAPSHOTS=1)
    and rerun — then review the diff before committing.
    """
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    current = Page.model_json_schema()
    current_json = json.dumps(current, indent=2, sort_keys=True)

    if os.environ.get("UPDATE_SNAPSHOTS") == "1" or not PAGE_SCHEMA_SNAPSHOT.exists():
        PAGE_SCHEMA_SNAPSHOT.write_text(current_json + "\n", encoding="utf-8")
        return

    stored = PAGE_SCHEMA_SNAPSHOT.read_text(encoding="utf-8").strip()
    if stored != current_json:
        pytest.fail(
            "Page JSON schema drifted from snapshot. "
            f"If intentional, rerun with UPDATE_SNAPSHOTS=1 to refresh "
            f"{PAGE_SCHEMA_SNAPSHOT} and update lib/types.ts + lib/schema.ts "
            "to match."
        )
