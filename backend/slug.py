"""Slug generation.

8-char nanoid from an alphabet without visually ambiguous characters
(0/O, 1/l/I). Keeps URLs typeable on a phone while preserving enough
entropy (32^8 = 2^40) for demo-scale collision safety.
"""

from __future__ import annotations

from nanoid import generate

# Unambiguous lowercase alphabet — no 0, 1, l, i, o.
ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
SLUG_LENGTH = 8


def make_slug() -> str:
    """Return a fresh 8-character slug."""
    return generate(ALPHABET, SLUG_LENGTH)
