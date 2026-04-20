"""Provably-fair hash-chain utilities.

The chain is built backwards from a random terminal seed: given seed[N-1],
seed[i] = sha256(seed[i+1]). We publish sha256(seed[0]) up front. When a
round uses seed[k], anyone can verify sha256(seed[k]) equals the
committed hash of the previous-consumed seed, all the way up the chain.

The crash multiplier is derived deterministically from the seed via HMAC
(so a leaked seed-to-multiplier mapping doesn't let anyone bias future
rounds). `crash_from_seed` bakes in a 1% house edge.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import secrets

SEED_BYTES = 32
_SALT = b"crashgame:v1"


def generate_chain(n: int) -> list[bytes]:
    """Return a length-`n` chain where chain[i] = sha256(chain[i+1]).

    Construction: pick chain[n-1] randomly, then walk backwards hashing.
    The caller stores the chain and reveals entries in reverse order.
    """
    if n <= 0:
        raise ValueError("chain length must be positive")
    # Build tail-first so the recurrence is obvious and easy to audit.
    chain: list[bytes] = [b""] * n
    chain[n - 1] = secrets.token_bytes(SEED_BYTES)
    for i in range(n - 2, -1, -1):
        chain[i] = hashlib.sha256(chain[i + 1]).digest()
    return chain


def verify_chain_step(revealed: bytes, expected_next_hash: bytes) -> bool:
    """Return True iff sha256(revealed) == expected_next_hash.

    The "next" in the name refers to the *previously-consumed* seed's hash,
    which is what the chain commits to (chain[i] = sha256(chain[i+1])).
    """
    return hashlib.sha256(revealed).digest() == expected_next_hash


def crash_from_seed(seed: bytes, salt: bytes = _SALT) -> int:
    """Derive the crash multiplier (as x100 int) from a revealed seed.

    Formula: HMAC-SHA256(seed, salt) → take top 52 bits as a uniform
    [0,1) float → `floor(99 / (1 - r)) / 100`. The 99/100 factor is the
    standard 1% house edge for this game family. Minimum crash is 1.00x.
    """
    h = hmac.new(seed, salt, hashlib.sha256).hexdigest()
    r = int(h[:13], 16) / (1 << 52)
    if r >= 1.0:  # defensively handle the theoretical 1.0 boundary
        return 100
    raw = math.floor(99 / (1 - r)) / 100
    # Clamp so the stored x100 int never drops below 1.00x.
    if raw < 1.00:
        return 100
    return int(round(raw * 100))
