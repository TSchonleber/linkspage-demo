# linkspage-demo

A link-in-bio builder. Next.js 15 frontend + Python (FastAPI) backend on Vercel Python Functions. Turso (libSQL) for storage. Built live on stream as an agentic-coding demo (Claude + Codex).

## Status

Early — spec and implementation plan are written; scaffolding begins next.

## Docs

- [`docs/specs/2026-04-19-link-in-bio-builder-design.md`](docs/specs/2026-04-19-link-in-bio-builder-design.md) — product + architecture spec
- [`docs/plans/2026-04-19-link-in-bio-builder-plan.md`](docs/plans/2026-04-19-link-in-bio-builder-plan.md) — parallel workstream execution plan
- [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md) — brief for Codex agents

## /play — Solana crash game

A provably-fair crash game (Aviator / Bustabit-style) built on top of this repo and deployed at the `/play` route. Players bet before each round, watch a multiplier climb exponentially, and cash out before it crashes — timing is everything. The crash point is determined by a pre-committed hash chain anchored to a Solana Anchor program, so neither the house nor any player can manipulate the outcome. Every result is client-verifiable after the fact.

**Spec:** [`docs/specs/2026-04-19-crashgame-design.md`](docs/specs/2026-04-19-crashgame-design.md)

**Modes:**
- **Demo mode** — no wallet required; play with virtual chips to see the mechanic and verify the hash chain yourself.
- **Real mode (devnet)** — connect a Solana wallet (Phantom / Backpack) to deposit and play with devnet SOL. Mainnet flip is a one-env-var switch once audited.

**Live demo:** https://d7demo.vercel.app/play

## Stack

- **Frontend:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Zustand · dnd-kit · Zod
- **Backend:** Python 3.12 · FastAPI · Pydantic v2 · Turso (libSQL)
- **Hosting:** Vercel (one project, two runtimes)
- **Cost:** $0 on free tiers

## Running locally

Instructions filled in by WS7 after scaffolding lands.
