# linkspage-demo

A link-in-bio builder. Next.js 15 frontend + Python (FastAPI) backend on Vercel Python Functions. Turso (libSQL) for storage. Built live on stream as an agentic-coding demo (Claude + Codex).

## Status

Early — spec and implementation plan are written; scaffolding begins next.

## Docs

- [`docs/specs/2026-04-19-link-in-bio-builder-design.md`](docs/specs/2026-04-19-link-in-bio-builder-design.md) — product + architecture spec
- [`docs/plans/2026-04-19-link-in-bio-builder-plan.md`](docs/plans/2026-04-19-link-in-bio-builder-plan.md) — parallel workstream execution plan
- [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md) — brief for Codex agents

## Stack

- **Frontend:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Zustand · dnd-kit · Zod
- **Backend:** Python 3.12 · FastAPI · Pydantic v2 · Turso (libSQL)
- **Hosting:** Vercel (one project, two runtimes)
- **Cost:** $0 on free tiers

## Running locally

Instructions filled in by WS7 after scaffolding lands.
