# crashgame — Anchor program

Provably-fair on-chain crash game (Aviator/Bustabit style). Vault-backed
balance ledger with a pre-committed sha256 hash chain for round seeds.

## Toolchain

Detected during build on this machine:

- rustc 1.94.1
- cargo 1.94.1
- anchor-cli 0.30.1
- solana-cli 3.1.12 (Agave client)

### If any of these are missing

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana (Agave)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor via avm (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

All installs go into user-local paths (`~/.cargo/bin`,
`~/.local/share/solana/install`). No sudo required.

## Build

```bash
# from repo root
cargo check --manifest-path programs/crashgame/Cargo.toml   # fast syntax check
anchor build                                                # full BPF build
anchor keys sync                                            # write real program id
```

After `anchor build` the IDL is emitted at `target/idl/crashgame.json` and
TypeScript types at `target/types/crashgame.ts`. The backend (CG-2) and
frontend (CG-3) import from those.

### Known IDL-build issue on this toolchain

`anchor-cli 0.30.1` + `rustc 1.94.1` fails at IDL-build time with
`no method named 'source_file' found for struct proc_macro2::Span`
because rustc removed the nightly `Span::source_file` API that anchor-syn
0.30.1's IDL builder uses. The BPF program itself builds fine
(`anchor build --no-idl` succeeds and `target/deploy/crashgame.so` is
produced). Options:

1. **Use `anchor build --no-idl`** to produce the deployable `.so`, then
   hand-write or script the IDL from `lib.rs`. A minimal IDL skeleton
   compatible with `@coral-xyz/anchor` TypeScript client can be checked
   in manually.
2. **Pin rustc 1.79**: `rustup install 1.79.0 && rustup override set 1.79.0`
   inside this repo, then `anchor build` works end-to-end.
3. **Upgrade to anchor 0.31.x** once the rest of this app's pinned deps
   tolerate it (bump in `programs/crashgame/Cargo.toml` and `Anchor.toml`).

This caveat only affects IDL JSON generation — the program is deployable
today via `anchor build --no-idl` followed by `anchor deploy`.

## Test

```bash
anchor test                                                 # localnet
anchor test --skip-local-validator --provider.cluster devnet
```

## Deploy (devnet)

```bash
solana-keygen new -o ~/.config/solana/id.json   # if you don't have a key yet
solana airdrop 2 --url devnet
anchor build
anchor deploy --provider.cluster devnet
anchor idl init <PROGRAM_ID> -f target/idl/crashgame.json --provider.cluster devnet
```

## Instruction summary

| instruction     | signer    | side-effects |
|-----------------|-----------|-------------------------------------------------|
| `initialize`    | authority | creates `Config` PDA, stores terminal hash      |
| `deposit`       | user      | transfer SOL → vault, init_if_needed `UserBalance` |
| `withdraw`      | user      | vault → user, decrements `UserBalance`          |
| `commit_round`  | authority | creates `Round` PDA with committed hash         |
| `settle_round`  | authority | verifies `sha256(seed) == committed_hash`, pays winners listed in `remaining_accounts`, records `crash_multiplier_bps` |

## PDAs

- `Config`       — `["config"]`
- `Vault`        — `["vault"]` (SystemAccount, holds SOL)
- `UserBalance`  — `["balance", user_pubkey]`
- `Round`        — `["round", round_id_le_bytes(u64)]`

## Provably-fair scheme

Operator pre-generates N seeds: `seed[i] = sha256(seed[i+1])`. The terminal
hash `sha256(seed[0])` is committed at `initialize`. For round *k* the
operator calls `commit_round(k, committed_hash)`; at settle time
`revealed_seed` must satisfy `sha256(revealed_seed) == committed_hash`.
Clients can walk the chain forward from any revealed seed back to the
terminal hash to verify honesty across all settled rounds.

Crash multiplier is deterministically derived from the revealed seed
(`derive_crash_bps` in `lib.rs`) using a 1%-house-edge Bustabit-style
formula, stored in basis points (10_000 = 1.00x).

## Integration notes

- Program ID (local devnet deploy keypair synced in this repo):
  `34SgyYj5SeunqBAYWMrgx5w8Yu8wSR8MLMekMaVNBpqg`
  Keypair at `target/deploy/crashgame-keypair.json`. Before mainnet or a
  shared devnet deploy, regenerate a fresh keypair and re-run
  `anchor keys sync` so every contributor doesn't share the same signing
  key.
- `settle_round` takes `payouts: Vec<Payout>` plus `remaining_accounts` in
  the same order. Each remaining account must be a writable SystemAccount
  matching the `user` pubkey in the corresponding `Payout`.
- All SOL transfers go through the System Program via CPI; the vault PDA
  signs using the `["vault"]` seed.
