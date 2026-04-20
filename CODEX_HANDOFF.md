# Codex Handoff — Link-in-Bio Builder

You (Codex) are assigned **WS3 (Editor Panel)** and **WS5 (Themes)** in the parallel build plan. Both are **frontend-only** (TypeScript + React). The Python backend is owned by other agents — you do not touch `backend/`, `api/`, or any `*.py` file.

## Read first
1. `docs/specs/2026-04-19-link-in-bio-builder-design.md` — full product + architecture spec (rev 2, includes Python backend)
2. `docs/plans/2026-04-19-link-in-bio-builder-plan.md` — execution plan, focus on WS3 and WS5 sections

## Prerequisites (don't start until these are green)
- [ ] **WS1-FE** landed on `main` — Next.js 15 + Tailwind + shadcn initialized, `pnpm dev` renders a placeholder split layout
- [ ] **WS2-FE** landed on `main` — `lib/types.ts`, `lib/schema.ts`, `lib/store.ts`, `lib/api.ts` exist and export the documented API

Check with: `cat lib/store.ts` — should be a Zustand store with actions matching WS2-FE in the plan.

The Python backend (WS1-PY, WS2-PY) runs in parallel and does not block you. You can reference `lib/types.ts` for the shared data shape.

## Your files (write freely)
- `components/editor/ProfileEditor.tsx`
- `components/editor/LinksEditor.tsx`
- `components/editor/LinkRow.tsx`
- `components/editor/AddLinkForm.tsx`
- `components/editor/ThemePicker.tsx`
- `app/page.tsx` (replace scaffold placeholder with real editor+preview layout)
- `lib/themes.ts`
- `app/globals.css` — **APPEND ONLY** below the `/* THEMES BELOW */` marker

## Off-limits (other agents own these)
- All Python: `backend/`, `api/`, `requirements.txt`, `pyproject.toml`, `migrations/`, `tests/backend/`, `vercel.json`
- Frontend data layer: `lib/store.ts`, `lib/types.ts`, `lib/schema.ts`, `lib/api.ts`
- `components/preview/*`
- `components/share/*`
- Existing rules in `app/globals.css` (you append only, under the `/* THEMES BELOW */` marker)

## Definition of done
- `pnpm build` passes with zero errors, zero `any`, zero `console.log`
- Editing any field updates the preview live via the Zustand store
- Three themes (Minimal, Neon, Sunset) all look visually distinct and polished
- Drag-reorder works with keyboard fallback
- URL validation blocks invalid adds

## Style notes
- Target aesthetic: Linear or Vercel dashboard — clean, confident, generous whitespace
- Avoid the generic "AI-generated app" look (excessive gradients, rounded-3xl everywhere, emoji icons)
- Use shadcn primitives as the base; customize where the spec calls for it

## Commit convention
- Prefix commits `ws3:` or `ws5:` so the parallel work is visible in history
- One logical commit per feature (`ws3: add ProfileEditor with avatar upload and bio counter`)

## When you're done
- Tag your final commits `ws3-done` and `ws5-done`
- Leave a short note in `NOTES_FROM_CODEX.md` at repo root: what you built, any decisions worth flagging, any follow-up risks
- Do NOT attempt to integrate with the backend — WS6-FE (owned by a Claude subagent) wires the Publish button to the Python API after your work lands
