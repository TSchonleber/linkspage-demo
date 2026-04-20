"""Edit-token helpers.

Raw tokens are generated with `secrets.token_urlsafe` and returned to the
browser exactly once. We only persist the sha256 hex digest so that a DB
leak does not expose the ability to edit pages.
"""

from __future__ import annotations

import hashlib
import secrets

# 24 bytes -> 32-character urlsafe base64 string. Plenty of entropy.
TOKEN_NBYTES = 24


def make_edit_token() -> str:
    """Return a fresh opaque token the caller should store client-side."""
    return secrets.token_urlsafe(TOKEN_NBYTES)


def hash_token(raw: str) -> str:
    """Return the sha256 hex digest of a raw token."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def verify_token(raw: str, hashed: str) -> bool:
    """Constant-time compare of a presented raw token against its stored hash."""
    return secrets.compare_digest(hash_token(raw), hashed)
