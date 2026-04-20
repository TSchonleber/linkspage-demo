# Crash Game — Design Spec

**Date:** 2026-04-19
**Status:** Design
**Purpose:** Solana-backed provably-fair crash game deployed at the `/play` route of linkspage-demo (https://d7demo.vercel.app/play)

---

## 1. Product

A crash game is a betting game where a multiplier starts at 1.00x and climbs exponentially each round. Players place bets during a brief betting window, then watch the multiplier rise. They can cash out at any point to lock in their current multiplier — but if the round crashes before they cash out, they lose their stake. The crash point is unpredictable to players because it is determined by a seed committed to the Solana blockchain before the round begins; the seed is revealed after the round ends, so anyone can verify that the house did not alter the outcome retroactively. Each seed hashes deterministically into the next via SHA-256, forming a chain that can be independently audited in any browser.

## 2. Users & Demo Value

**Who plays:**
- Demo viewers watching the Discord stream who want to see agentic coding produce a real interactive product, not just a CRUD app.
- Developers evaluating the linkspage-demo repo as a reference for Next.js + FastAPI + Anchor integration.
- Crypto-curious users who have never played a provably-fair game and want to verify the math themselves.

**Why viewers will want to watch:**
A crash game has every ingredient that makes a live coding demo compelling: real-time animation, on-chain state, mathematical elegance (the hash chain is short enough to explain in one sentence), and obvious money on the table. Demo mode means no wallet friction — a viewer can open the URL and start clicking within 10 seconds. The hash-chain verifier is a visible "show your work" moment that demonstrates Solana is actually doing something meaningful, not just decorative.

## 3. Scope

### MVP (must ship)
- Round lifecycle: 10-second betting window → multiplier running → crash → settle → repeat
- Demo mode: no wallet required; virtual chips; full UI and hash-chain verifier work identically
- Real mode (devnet): connect Phantom / Backpack wallet; deposit devnet SOL into vault PDA; bet, cash out, withdraw
- Provably-fair hash chain: server generates N seeds offline, commits terminal hash on-chain via `initialize`, reveals seeds in reverse order post-round
- Client-side multiplier display computed locally via `exp(t/6)` — silky smooth regardless of server polling latency
- Crash point formula: `floor(99 / (1 - r)) / 100` with ~1% house edge baked in
- In-browser hash-chain verifier: paste any seed, walk the chain, confirm crash point
- Bet history panel: last 20 rounds with crash points and player outcomes
- Responsive UI: desktop-first, playable on mobile

### Stretch (post-MVP)
- Mainnet flip: change `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` and redeploy; no code changes required
- Leaderboard: top 10 wins/losses by session (anonymous, stored server-side)
- Live chat overlay: viewer messages alongside the multiplier graph
- Tournament mode: fixed entry fee, winner-takes-most payout at round 50
- Autobet: set a target cashout multiplier; server-authoritative cashout still enforced

### Out of scope
- Jackpots or bonus rounds
- Multi-currency (SOL only)
- Complex derivatives or side bets
- Player accounts or persistent identity beyond wallet pubkey
- Admin dashboard (takedown is env-var + deploy)

## 4. Stack

### Frontend
| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 App Router | Repo baseline; Vercel-native |
| Language | TypeScript (strict) | End-to-end type safety with Zod/Pydantic contract |
| Styling | Tailwind v4 | Repo baseline; zero-config |
| Components | shadcn/ui | Repo baseline; consistent with rest of app |
| Wallet | `@solana/wallet-adapter-react` + Phantom/Backpack adapters | Standard Solana wallet integration |
| Solana client | `@solana/web3.js` v1 + `@coral-xyz/anchor` | Anchor IDL type safety |
| State | Zustand | Repo baseline; no provider boilerplate |
| Validation | Zod | Mirrors Pydantic schema shape |
| Animation | CSS transitions + `requestAnimationFrame` | No extra dep for multiplier ticker |

### Backend
| Concern | Choice | Why |
|---|---|---|
| Runtime | Python 3.12 on Vercel Python Functions | Repo baseline |
| Framework | FastAPI | Repo baseline; async, Pydantic-native |
| Validation | Pydantic v2 | Contract source of truth |
| Database | Turso (libSQL) free tier | Repo baseline; zero infra |
| Hash/crypto | `hashlib` (stdlib) + `hmac` (stdlib) | No external dep for seed chain |
| Round clock | Lazy advance on GET `/api/crash/current` | Serverless-friendly; no cron needed |
| Hosting | Vercel (same project) | Single deploy target |

### On-chain
| Concern | Choice | Why |
|---|---|---|
| Chain | Solana devnet → mainnet | Fast finality, low fees |
| Framework | Anchor 0.30 | Type-safe Rust programs, IDL generation |
| RPC | Helius free tier | Reliable devnet/mainnet RPC; 1M credits/month free |
| Vault | PDA derived from `[b"vault", authority]` | Deterministic, no keypair management for vault |
| Token | Native SOL lamports | No SPL token overhead for MVP |

## 5. Architecture

```
Repo root
├── programs/
│   └── crashgame/                        # Anchor Rust program
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                    # program entrypoint, instruction dispatch
│           ├── instructions/
│           │   ├── initialize.rs         # set terminal_hash, open vault PDA
│           │   ├── deposit.rs            # player deposits SOL into vault
│           │   ├── withdraw.rs           # player withdraws unlocked balance
│           │   ├── commit_round.rs       # server commits seed hash for next round
│           │   └── settle_round.rs       # server settles bets, transfers rake to treasury
│           └── state/
│               ├── game_state.rs         # GameState account: round_id, terminal_hash, …
│               └── player_account.rs     # PlayerAccount: balance_lamports, locked_lamports
│
├── backend/
│   ├── crash/                            # crash game domain logic
│   │   ├── __init__.py
│   │   ├── chain.py                      # seed chain generation + crash_from_seed()
│   │   ├── round.py                      # RoundManager: state machine, lazy advance
│   │   ├── bets.py                       # BetManager: place_bet(), cashout()
│   │   └── solana.py                     # AnchorClient: sign + send instructions
│   └── routes/
│       └── crash.py                      # FastAPI router mounted at /api/crash
│
├── app/
│   └── play/
│       └── page.tsx                      # /play route — CrashGame shell
│
├── components/
│   └── crash/
│       ├── CrashGame.tsx                 # top-level client component, state coordinator
│       ├── MultiplierGraph.tsx           # animated SVG/canvas multiplier curve
│       ├── BettingPanel.tsx              # bet amount input, bet/cashout button
│       ├── BetHistory.tsx                # last 20 rounds panel
│       ├── PlayerBets.tsx                # live bets table (who's in, at what amount)
│       ├── HashVerifier.tsx              # paste-a-seed client-side verifier
│       ├── WalletBar.tsx                 # connect wallet / demo mode toggle
│       └── DemoChip.tsx                  # virtual chip display for demo mode
│
├── lib/
│   ├── crash.ts                          # API fetch wrappers, types, Zod schemas
│   └── solana.ts                         # wallet adapter setup, Anchor provider init
│
├── migrations/
│   └── 0002_crash.sql                    # crash_rounds, crash_bets, crash_seed_chain
│
└── Anchor.toml                           # Anchor workspace config
```

## 6. Round Lifecycle

Each round advances through four states. The server is **stateless between requests** — state is stored in Turso. The current round state is computed lazily when `GET /api/crash/current` is called; if the clock says the betting window has expired and the round is still in `betting` state, the handler advances it to `running` before returning. If the running window has expired past the crash point, the handler advances it to `crashed` and triggers settlement.

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                        ROUND LIFECYCLE                          │
  └─────────────────────────────────────────────────────────────────┘

  BETTING (10 s)
  ┌──────────────────────────────┐
  │  round_id minted             │
  │  seed hash committed on-chain│   Players POST /api/crash/bet
  │  bets accepted               │   (rejected if round_state != betting)
  └────────────┬─────────────────┘
               │ betting window elapses (lazy advance on next GET)
               ▼
  RUNNING (unbounded — ends at crash)
  ┌──────────────────────────────┐
  │  multiplier climbs: exp(t/6) │   Players POST /api/crash/cashout
  │  cashouts accepted           │   Server records cashout_at timestamp
  │  no new bets                 │   Server is authoritative on timing
  └────────────┬─────────────────┘
               │ elapsed_ms >= crash_point_ms (lazy advance on next GET)
               ▼
  CRASHED
  ┌──────────────────────────────┐
  │  crash multiplier revealed   │   Unsettled bets marked as lost
  │  seed revealed to clients    │   Winners credited from vault
  │  settlement triggered        │   settle_round Anchor instruction sent
  └────────────┬─────────────────┘
               │ settlement complete (or 2 s timeout → mark settled)
               ▼
  NEXT_ROUND (immediate)
  ┌──────────────────────────────┐
  │  new round_id minted         │
  │  next seed hash committed    │
  │  state = betting, timer reset│
  └──────────────────────────────┘
```

**Timing notes:**
- Betting window: 10 s hard cutoff. Server rejects bets received after `bet_close_at`.
- Running window: the crash point is computed from the revealed seed; the crash time in ms is `(crash_point - 1.0) * 6000` (inverse of `exp(t/6)`).
- Polling cadence: clients poll `GET /api/crash/current` every 500 ms. The multiplier is computed client-side via `exp(elapsed_s / 6)` for smooth animation.
- History: clients poll `GET /api/crash/history` every 5 s (low-frequency; used only for the bet history panel).

**Why lazy state-advance instead of a cron:**
Vercel Python Functions are ephemeral and cannot maintain timers. A background cron would require a separate service. Instead, the GET `/api/crash/current` handler checks wall clock against stored timestamps and advances state if needed. Worst case: a round lingers 500 ms past its crash time before the next poll triggers settlement. This is acceptable for the demo; if a client crashes between the crash and the next GET, the state is recovered on reconnect.

## 7. Provably-Fair Hash Chain

### Design

Generate N seeds offline before deploying. The seeds form a chain:

```
seed[N-1]  →  sha256  →  seed[N-2]  →  sha256  →  ...  →  seed[0]
```

`seed[i] = sha256(seed[i+1])` for i in 0..N-2. `seed[N-1]` is the private starting secret; `seed[0]` is the **terminal hash** committed on-chain before any play begins.

Rounds are served in order: round 1 uses `seed[N-1]`, round 2 uses `seed[N-2]`, …, round k uses `seed[N-k]`. After each round, the server reveals that round's seed; clients can verify `sha256(revealed_seed) == seed_from_previous_round` (or `== terminal_hash` for round 1) to confirm the server did not swap seeds post-hoc.

### Anchor `initialize` instruction

Before the first round, the server calls `initialize(terminal_hash: [u8; 32])`. This writes `terminal_hash` to the `GameState` account. Clients read the on-chain `terminal_hash` and use it as the anchor of the chain verification.

### Client-side verification snippet (TypeScript)

```ts
import { createHash, createHmac } from "crypto"; // Node — in browser, use SubtleCrypto

// Walk the chain forward from a revealed seed, confirming each step.
// revealedSeeds: array of hex strings, index 0 = earliest round's seed (highest index in chain)
// terminalHash: hex string read from GameState on-chain account
function verifyChain(revealedSeeds: string[], terminalHash: string): boolean {
  let current = terminalHash;
  // Seeds are revealed in reverse order: seed[N-1], seed[N-2], ...
  // terminal_hash = seed[0] = sha256(seed[1]) = sha256(sha256(seed[2])) ...
  // Walk backward: current should equal sha256 of the next revealed seed
  for (let i = revealedSeeds.length - 1; i >= 0; i--) {
    const hashed = createHash("sha256")
      .update(Buffer.from(revealedSeeds[i], "hex"))
      .digest("hex");
    if (hashed !== current) return false;
    current = revealedSeeds[i];
  }
  return true;
}

// Compute crash point from a revealed seed (mirrors Python crash_from_seed).
function crashFromSeed(seedHex: string): number {
  const hmacResult = createHmac("sha256", Buffer.from(seedHex, "hex"))
    .update("crash")
    .digest("hex");
  const r = parseInt(hmacResult.slice(0, 13), 16) / 2 ** 52;
  if (r >= 1.0) return 1.0; // house edge: ~1% of the time crashes immediately
  return Math.floor(99 / (1 - r)) / 100;
}
```

**Browser note:** `SubtleCrypto.digest("SHA-256", data)` is the browser equivalent of `createHash("sha256")`. The `HashVerifier` component wraps SubtleCrypto and runs entirely client-side — no server round-trip.

## 8. Crash-Point Formula

### Python (server, authoritative)

```python
import hmac
import hashlib
import math

HOUSE_EDGE = 0.01  # 1%

def crash_from_seed(seed_hex: str) -> float:
    """
    Derive crash multiplier from a round seed.
    Returns a float >= 1.00 (minimum crash is 1.00x).
    ~1% of rounds crash immediately at 1.00x (house edge).
    """
    h = hmac.new(
        key=bytes.fromhex(seed_hex),
        msg=b"crash",
        digestmod=hashlib.sha256,
    ).hexdigest()
    # Take first 13 hex chars = 52 bits — fits cleanly in a double mantissa
    r = int(h[:13], 16) / (2 ** 52)
    if r >= (1 - HOUSE_EDGE):
        return 1.00  # house wins
    return math.floor(99 / (1 - r)) / 100


def crash_time_ms(crash_point: float) -> float:
    """
    Inverse of exp(t/6) = crash_point.
    Returns time in milliseconds at which the multiplier hits crash_point.
    """
    return math.log(crash_point) * 6000
```

**Formula intuition:** `r` is uniform in [0, 1). `99 / (1 - r)` maps r=0 → 99.00x and approaches infinity as r → 1. Flooring to two decimal places and adding the 1% house-edge early-exit gives the house an expected take of ~1% per round. The distribution is heavy-tailed — most rounds crash low, rare rounds go very high, which is the correct shape for a crash game.

## 9. Data Model

### Python (source of truth) — `backend/crash/`

```python
from pydantic import BaseModel, Field
from typing import Literal
from enum import Enum

class RoundState(str, Enum):
    BETTING = "betting"
    RUNNING = "running"
    CRASHED = "crashed"
    SETTLED = "settled"

class CrashRound(BaseModel):
    round_id: int
    state: RoundState
    bet_close_at: float           # unix ms — wall clock cutoff for bets
    started_at: float | None      # unix ms — when running began
    crashed_at: float | None      # unix ms — when crash occurred
    crash_point: float | None     # e.g. 2.34 — None until crashed
    seed_hash: str                # sha256 of the round's seed (pre-reveal)
    seed: str | None              # hex seed — None until crashed/settled
    committed_tx: str | None      # Anchor tx sig for commit_round (or None in demo)

class CrashBet(BaseModel):
    bet_id: str                   # nanoid
    round_id: int
    player_pubkey: str            # wallet pubkey or "DEMO_<session_id>"
    amount_lamports: int          # 0 for demo mode
    cashed_out_at: float | None   # unix ms — None if not cashed out
    cashout_multiplier: float | None
    outcome: Literal["win", "loss", "pending"] = "pending"

class CrashHistoryEntry(BaseModel):
    round_id: int
    crash_point: float
    seed: str                     # revealed seed for verification
    player_count: int
    total_wagered_lamports: int
```

### TypeScript mirror — `lib/crash.ts`

```ts
export type RoundState = "betting" | "running" | "crashed" | "settled";

export type CrashRound = {
  round_id: number;
  state: RoundState;
  bet_close_at: number;           // unix ms
  started_at: number | null;
  crashed_at: number | null;
  crash_point: number | null;
  seed_hash: string;
  seed: string | null;            // revealed post-crash
  committed_tx: string | null;
};

export type CrashBet = {
  bet_id: string;
  round_id: number;
  player_pubkey: string;
  amount_lamports: number;
  cashed_out_at: number | null;
  cashout_multiplier: number | null;
  outcome: "win" | "loss" | "pending";
};

export type CrashHistoryEntry = {
  round_id: number;
  crash_point: number;
  seed: string;
  player_count: number;
  total_wagered_lamports: number;
};

// Current game state returned by GET /api/crash/current
export type CrashCurrentResponse = {
  round: CrashRound;
  your_bet: CrashBet | null;     // present if player_pubkey query param matches a bet
  server_time_ms: number;         // used to sync client clock with server for cashout timing
};
```

### Database schema — `migrations/0002_crash.sql`

```sql
CREATE TABLE IF NOT EXISTS crash_rounds (
  round_id          INTEGER PRIMARY KEY,
  state             TEXT NOT NULL DEFAULT 'betting',  -- betting|running|crashed|settled
  bet_close_at      REAL NOT NULL,                    -- unix ms
  started_at        REAL,                             -- unix ms, null until running
  crashed_at        REAL,                             -- unix ms, null until crashed
  crash_point       REAL,                             -- null until crashed
  seed_hash         TEXT NOT NULL,                    -- sha256(seed) pre-reveal
  seed              TEXT,                             -- null until crashed/settled
  committed_tx      TEXT,                             -- Anchor tx sig (null in demo)
  created_at        REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS crash_bets (
  bet_id            TEXT PRIMARY KEY,
  round_id          INTEGER NOT NULL REFERENCES crash_rounds(round_id),
  player_pubkey     TEXT NOT NULL,                    -- wallet pubkey or "DEMO_<id>"
  amount_lamports   INTEGER NOT NULL DEFAULT 0,
  placed_at         REAL NOT NULL,                    -- unix ms
  cashed_out_at     REAL,                             -- unix ms, null if not cashed out
  cashout_multiplier REAL,                            -- null if not cashed out
  outcome           TEXT NOT NULL DEFAULT 'pending',  -- win|loss|pending
  settle_tx         TEXT                              -- Anchor tx sig for this cashout (null in demo)
);

CREATE TABLE IF NOT EXISTS crash_seed_chain (
  chain_index       INTEGER PRIMARY KEY,              -- 0 = terminal hash, N-1 = first round
  seed_hex          TEXT NOT NULL,
  used              INTEGER NOT NULL DEFAULT 0,       -- 1 once the round is settled
  round_id          INTEGER REFERENCES crash_rounds(round_id)
);

CREATE INDEX IF NOT EXISTS crash_bets_round ON crash_bets(round_id);
CREATE INDEX IF NOT EXISTS crash_bets_player ON crash_bets(player_pubkey);
CREATE INDEX IF NOT EXISTS crash_rounds_state ON crash_rounds(state);
```

## 10. API Surface

| Method | Path | Body / Params | Response | Notes |
|---|---|---|---|---|
| GET | `/api/crash/current` | `?pubkey=<wallet_or_demo>` | `CrashCurrentResponse` | Lazy state advance; 500 ms poll cadence |
| POST | `/api/crash/bet` | `{ round_id, player_pubkey, amount_lamports }` | `CrashBet` | Rejected if state != betting or past bet_close_at |
| POST | `/api/crash/cashout` | `{ bet_id, player_pubkey }` | `CrashBet` | Server timestamps cashout; rejected if already crashed or cashed out |
| GET | `/api/crash/history` | `?limit=20` | `CrashHistoryEntry[]` | Settled rounds only; 5 s poll cadence |
| GET | `/api/crash/verify` | `?seed=<hex>&chain_depth=<n>` | `{ crash_point, chain_valid }` | Server-side chain walk; client can also verify locally |

**Error responses:** standard FastAPI 422 for validation errors; 400 with `{ detail: string }` for game-logic rejections (late bet, already cashed out, etc.).

## 11. Anchor Instructions

All instructions that mutate game state are signed by `CRASHGAME_AUTHORITY` (the server keypair). Player deposit/withdraw instructions are signed by the player's wallet.

### `initialize`
Sets up the game: writes `terminal_hash` to `GameState`, initializes the vault PDA.
```
Accounts:
  authority       [signer, mut]     — server keypair
  game_state      [init, mut]       — PDA: ["game_state", authority]
  vault           [init, mut]       — PDA: ["vault", authority] — holds SOL
  system_program  []
Args:
  terminal_hash: [u8; 32]
```

### `deposit`
Player sends SOL into the vault; server credits their `PlayerAccount`.
```
Accounts:
  player          [signer, mut]
  player_account  [init_if_needed, mut]  — PDA: ["player", player.key]
  vault           [mut]                  — PDA: ["vault", authority]
  system_program  []
Args:
  amount_lamports: u64
```

### `withdraw`
Player withdraws unlocked balance (i.e., not locked in an active bet).
```
Accounts:
  player          [signer, mut]
  player_account  [mut]                  — PDA: ["player", player.key]
  vault           [mut]                  — PDA: ["vault", authority]
  system_program  []
Args:
  amount_lamports: u64
```

### `commit_round`
Server commits the seed hash for the upcoming round. Called during the betting window.
```
Accounts:
  authority       [signer]
  game_state      [mut]                  — PDA: ["game_state", authority]
Args:
  round_id: u64
  seed_hash: [u8; 32]
```

### `settle_round`
Server settles all bets for the crashed round. Transfers rake to treasury. Transfers winnings to PlayerAccount balances.
```
Accounts:
  authority       [signer, mut]
  game_state      [mut]
  vault           [mut]                  — PDA: ["vault", authority]
  treasury        [mut]                  — CRASHGAME_TREASURY_PUBKEY
  system_program  []
Args:
  round_id: u64
  seed: [u8; 32]                         — revealed seed; program verifies sha256(seed) == committed seed_hash
  winners: Vec<(Pubkey, u64)>            — (player_pubkey, payout_lamports) for each cashout
  rake_lamports: u64
```

**Note on settle_round winners list:** The server computes all cashout payouts off-chain (from `crash_bets` table), passes the list as instruction args. The Anchor program verifies the seed matches the committed hash before accepting any payouts — if the seed is wrong, the instruction fails and the round cannot be settled.

## 12. Client-Server Contract

### Multiplier computation

The server does **not** stream the multiplier. Clients compute it locally:

```ts
// Called on each animation frame during the RUNNING state
function currentMultiplier(startedAtMs: number, serverTimeDeltaMs: number): number {
  const elapsedS = (Date.now() + serverTimeDeltaMs - startedAtMs) / 1000;
  return Math.exp(elapsedS / 6);
}
```

`serverTimeDeltaMs` is the difference between server-reported `server_time_ms` and local `Date.now()` at the time of the last poll, used to correct for client clock skew. Multipliers below 1.0 are clamped to 1.0.

### Polling cadence

| Endpoint | Cadence | Rationale |
|---|---|---|
| GET `/api/crash/current` | 500 ms | Fast enough to detect state transitions within half a second |
| GET `/api/crash/history` | 5 s | History panel does not need real-time updates |
| Anchor `GameState` read | On connect + after settle | Only needed for terminal_hash verification; not polled continuously |

### Cashout timing

The client sends `POST /api/crash/cashout` when the player clicks the button. The server records `cashout_at = time.time_ns() // 1_000_000` (milliseconds) immediately on receipt. The server then checks: if `cashout_at >= crashed_at`, the cashout is rejected (too late). Network latency is the player's risk — this mirrors how real crash games work.

**Anti-manipulation:** the server checks that `cashout_at` is within a 2-second window before `crashed_at`. Any cashout timestamped more than 2 seconds before the server's record of the crash (which would indicate a backdated request) is rejected.

## 13. Security & Abuse

| Concern | Mitigation |
|---|---|
| Late cashout claims | Server timestamps on receipt; rejects if `cashout_at >= crashed_at` |
| Backdated cashout requests | Reject if `crashed_at - cashout_at > 2000 ms` |
| Bet placed after betting window | `bet_close_at` enforced server-side; rejected with 400 |
| Demo mode collusion | Demo player_pubkey uses `DEMO_<session_id>` — no real lamports at stake; demo balances are in-memory only, not persisted to vault |
| Wallet spoofing in real mode | Server requires a signed message from the wallet pubkey for deposit/withdraw instructions (Anchor program enforces signer constraint) |
| Seed manipulation | Anchor `settle_round` verifies `sha256(seed) == committed_seed_hash` on-chain; server cannot swap seeds post-commit |
| DDoS / spam bets | Rate limit: 10 bets per wallet per 60 s (in-memory per function instance; good enough for demo) |
| Admin takedown | `ADMIN_DELETE_KEY` header on `DELETE /api/crash/admin/shutdown` pauses round advancement |
| Replay attacks | `round_id` is monotonically increasing; server rejects bets for any round_id other than the current one |

## 14. Demo Mode vs Real Mode

### Demo mode (`player_pubkey = "DEMO_<session_id>"`)

The frontend sets `player_pubkey` to `"DEMO_" + nanoid(10)` stored in `sessionStorage`. No wallet connection required. The backend accepts this pubkey and tracks bets with `amount_lamports = 0`. The vault PDA is not touched. Settlement runs the same code path but skips the Anchor `settle_round` instruction.

Demo chips are displayed in the UI as virtual currency (e.g., "1000 chips"). The UI shows a persistent banner: **"Demo mode — no real money"**. Players can still verify the hash chain, watch the multiplier, place virtual bets, and cash out — the full experience minus on-chain settlement.

### Real mode (devnet)

User connects wallet via `@solana/wallet-adapter-react`. The `WalletBar` component surfaces Phantom and Backpack. Once connected, the `player_pubkey` query param uses the real wallet pubkey. The user must deposit SOL via the `deposit` Anchor instruction before placing bets. Balances are tracked in `PlayerAccount` on-chain (source of truth) and mirrored in Turso for fast reads.

### Switching to mainnet

Set `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta` and `NEXT_PUBLIC_SOLANA_RPC_ENDPOINT` to a mainnet Helius endpoint. Redeploy. No code changes. The Anchor program must be redeployed on mainnet with a new `CRASHGAME_PROGRAM_ID` and a funded treasury wallet. An audit is strongly recommended before mainnet launch.

## 15. Definition of Done

- [ ] `pnpm dev` runs `/play` at `:3000` with demo mode fully playable
- [ ] `vercel dev` runs frontend + Python crash routes locally
- [ ] `pnpm build` passes with zero TypeScript errors
- [ ] `pytest tests/backend/test_crash.py -q` passes green
- [ ] `ruff check backend/crash/` clean
- [ ] `anchor build` compiles without warnings
- [ ] `anchor test` passes on localnet
- [ ] Hash-chain verifier in-browser: paste seed, get crash point + chain valid confirmation
- [ ] Deployed at https://d7demo.vercel.app/play with demo mode playable (no wallet required)
- [ ] Solana GameState `terminal_hash` readable via Solana Explorer on devnet
- [ ] Round lifecycle completes end-to-end: bet → run → crash → settle → next round
- [ ] README `/play` section updated with live URL

## 16. Deploy Steps

### Environment variables required

See `.env.example` — Solana section. Set all six vars in the Vercel project dashboard before deploying.

### Helius RPC setup

1. Create account at https://helius.dev
2. Create a new app, select **Devnet**
3. Copy the RPC endpoint (format: `https://devnet.helius-rpc.com/?api-key=<key>`)
4. Set `NEXT_PUBLIC_SOLANA_RPC_ENDPOINT` and `HELIUS_API_KEY` in Vercel

### Anchor program deploy (devnet)

```bash
# Install Anchor CLI if not present
cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install latest && avm use latest

# Build the program
anchor build

# Deploy to devnet (ensure solana CLI is configured for devnet and authority wallet is funded)
solana config set --url devnet
anchor deploy --program-name crashgame --program-keypair target/deploy/crashgame-keypair.json

# Copy the Program Id from output and set:
# CRASHGAME_PROGRAM_ID=<output Program Id>
```

### Authority keypair setup

```bash
# Generate a new keypair for the server authority
solana-keygen new --outfile ~/.config/crashgame-authority.json

# Fund it on devnet
solana airdrop 2 $(solana-keygen pubkey ~/.config/crashgame-authority.json) --url devnet

# Encode as base58 for CRASHGAME_AUTHORITY_SECRET
# (use a base58 encoder or: `cat ~/.config/crashgame-authority.json | python3 -c "import sys,json,base58; print(base58.b58encode(bytes(json.load(sys.stdin))).decode())"`)
```

### Initialize game state on-chain

After deploying, run the `initialize` instruction once to commit the terminal hash:

```bash
# TODO: the Anchor admin script (programs/crashgame/scripts/initialize.ts) is
# generated by CG-1 (Anchor program subagent). Set CRASHGAME_PROGRAM_ID and
# CRASHGAME_AUTHORITY_SECRET in your shell, then:
npx ts-node programs/crashgame/scripts/initialize.ts
```

### Treasury wallet

```bash
# Generate or use an existing wallet as the treasury
solana-keygen new --outfile ~/.config/crashgame-treasury.json
CRASHGAME_TREASURY_PUBKEY=$(solana-keygen pubkey ~/.config/crashgame-treasury.json)
```

### Seed chain generation

```bash
# Generate N seeds and commit terminal hash.
# TODO: backend/crash/scripts/gen_seeds.py is written by CG-2 (FastAPI subagent).
# Run once before first round:
python3 backend/crash/scripts/gen_seeds.py --count 10000 --output seeds.json
# seeds.json is loaded into crash_seed_chain table via migration or admin endpoint.
# terminal_hash from seeds.json is passed to initialize.ts above.
```

### Vercel deploy

```bash
# Push to main — Vercel auto-deploys on push (repo already connected per linkspage-demo setup)
git push origin main

# Or deploy manually:
vercel --prod
```
