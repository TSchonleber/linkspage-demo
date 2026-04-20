# Link-in-Bio Builder — Implementation Plan

**Spec:** `docs/specs/2026-04-19-link-in-bio-builder-design.md` (rev 2 with Python backend)
**Execution model:** Parallel workstreams across Claude subagents and Codex. File-level ownership prevents conflicts. Frontend is TypeScript/Next.js; backend is Python/FastAPI on Vercel Python Functions.

---

## Dependency Graph

```
                    ┌──────────────────────────┐
                    │  WS1-FE (Next scaffold)  │────┐
                    └──────────────────────────┘    │
                                                    ├──► WS3 (Editor UI / Codex)
                    ┌──────────────────────────┐    │
                    │  WS1-PY (FastAPI scaf.)  │────┼──► WS4 (Preview + Public /p/[slug])
                    └──────────────────────────┘    │
                                │                   ├──► WS5 (Themes / Codex)
                                ▼                   │
                    ┌──────────────────────────┐    │
                    │  WS2-PY (Pydantic + DB)  │────┤
                    └──────────────────────────┘    │
                                │                   │
                                ▼                   │
                    ┌──────────────────────────┐    │
                    │  WS6-PY (Pages CRUD API) │────┤
                    └──────────────────────────┘    │
                                │                   │
    ┌──────────────────────────┐│                   │
    │  WS2-FE (types/store/api)││                   │
    └──────────────────────────┘│                   │
                │               │                   │
                └───────────────┴──► WS6-FE (Publish/fetch) ──► WS7 (Polish & Deploy)
```

**Critical path:** WS1-FE → WS2-FE → WS6-FE (publish needs store + backend)
**Critical path:** WS1-PY → WS2-PY → WS6-PY (API needs models + DB)
**These two chains are independent and run in parallel.** The only cross-chain dependency is WS6-FE consuming WS6-PY's API — both can be built against the spec's API surface concurrently, integrated at the end.

---

## Phase-by-Phase Execution

### Phase A — Dual scaffolds (parallel, ~10 min)
- **Track 1 (frontend):** WS1-FE
- **Track 2 (backend):** WS1-PY

Gate to Phase B: frontend `pnpm build` passes; backend `vercel dev` serves `GET /api/health → {ok: true}`.

### Phase B — Foundations (parallel, ~15 min)
- **Track 1:** WS2-FE (types, Zod, store, api client stubs)
- **Track 2:** WS2-PY (Pydantic models, DB client, migrations)

Gate to Phase C: both tracks have passing unit tests (frontend: tsc clean; backend: pytest green).

### Phase C — Feature fan-out (parallel, ~25 min)
- **Codex:** WS3 (Editor UI) — needs WS2-FE
- **Codex (or 2nd instance):** WS5 (Themes) — needs WS2-FE
- **Claude subagent:** WS4 (Preview + Public /p/[slug]) — needs WS2-FE + will call WS6-PY
- **Claude subagent:** WS6-PY (Pages CRUD API) — needs WS2-PY

Gate to Phase D: each WS's own unit-level DoD met (details below).

### Phase D — Integration (short-sequential, ~10 min)
- Claude subagent runs WS6-FE: wire PublishButton to real backend, connect `/p/[slug]` to fetch

Gate to Phase E: full publish → view loop works end-to-end on localhost.

### Phase E — Polish & deploy (~10 min)
- WS7: README, empty states, animations, Vercel project setup, Turso provisioning, env vars, deploy.

---

## Workstream Ownership (file-level)

| WS | Owner | Files (exclusive write access) |
|---|---|---|
| WS1-FE | Claude subagent | `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder), `.gitignore` (node section), `README.md` (skeleton) |
| WS1-PY | Claude subagent | `api/index.py`, `backend/__init__.py`, `backend/app.py`, `requirements.txt`, `pyproject.toml`, `vercel.json`, `.gitignore` (python section), `.env.example` |
| WS2-FE | Claude subagent | `lib/types.ts`, `lib/schema.ts`, `lib/store.ts`, `lib/api.ts` (fetch wrappers) |
| WS2-PY | Claude subagent | `backend/models.py`, `backend/db.py`, `backend/slug.py`, `backend/security.py`, `migrations/0001_init.sql`, `tests/backend/test_models.py` |
| WS3 | **Codex** | `components/editor/*` (except `ThemePicker.tsx`), `app/page.tsx` (final version) |
| WS4 | Claude subagent | `components/preview/*`, `app/p/[slug]/page.tsx` |
| WS5 | **Codex** | `lib/themes.ts`, `components/editor/ThemePicker.tsx`, append-only CSS in `app/globals.css` |
| WS6-PY | Claude subagent | `backend/routes/pages.py`, `backend/routes/__init__.py`, `tests/backend/test_pages.py` |
| WS6-FE | Claude subagent | `components/share/*` |
| WS7 | Any | cross-cutting polish, README completion, Vercel config, deploy |

**Shared file discipline:**
- `app/globals.css`: WS5 appends below `/* THEMES BELOW */` marker placed by WS1-FE.
- `.gitignore`: WS1-FE adds Node section, WS1-PY adds Python section — they touch disjoint blocks with headers `# --- node ---` / `# --- python ---`.
- `README.md`: WS1-FE writes skeleton, WS7 fills sections.

---

## WS1-FE — Frontend Scaffold

**Goal:** Runnable Next.js 15 app with Tailwind + shadcn/ui.

**Tasks:**
1. `pnpm create next-app@latest . --ts --tailwind --app --eslint --no-src-dir --turbopack --import-alias "@/*"`
2. Install: `zustand @dnd-kit/core @dnd-kit/sortable zod nanoid clsx lucide-react`
3. Initialize shadcn: `pnpm dlx shadcn@latest init` → Neutral, CSS vars on
4. Add shadcn primitives: `button`, `input`, `textarea`, `card`, `select`, `switch`, `toast`, `dialog`
5. `app/layout.tsx`: sans-serif root
6. `app/globals.css`: Tailwind directives + `/* THEMES BELOW */` marker at EOF
7. `app/page.tsx` placeholder: split layout placeholder — replaced by WS3
8. README skeleton with two sections: "Run frontend" and "Run backend" (WS7 fills)

**Done when:**
- `pnpm dev` → placeholder renders
- `pnpm build` passes
- No runtime console errors

---

## WS1-PY — Backend Scaffold

**Goal:** FastAPI app reachable via Vercel Python Functions. `GET /api/health` returns `{"ok": true}`.

**Tasks:**
1. Create `requirements.txt`:
   ```
   fastapi==0.115.*
   pydantic==2.9.*
   libsql-client==0.3.*
   nanoid==2.0.*
   python-multipart==0.0.*
   ```
2. Create `pyproject.toml` with:
   ```toml
   [tool.ruff]
   line-length = 100
   target-version = "py312"

   [tool.pytest.ini_options]
   testpaths = ["tests/backend"]
   addopts = "-q"
   ```
   Dev deps (install separately): `pytest httpx ruff`
3. Create `backend/__init__.py` (empty).
4. Create `backend/app.py`:
   ```python
   from fastapi import FastAPI

   def create_app() -> FastAPI:
       app = FastAPI(title="link-in-bio", docs_url="/api/docs", openapi_url="/api/openapi.json")

       @app.get("/api/health")
       def health(): return {"ok": True}

       # WS6-PY wires routers here
       return app

   app = create_app()
   ```
5. Create `api/index.py` (Vercel entry):
   ```python
   from backend.app import app  # re-export for Vercel
   ```
6. Create `vercel.json`:
   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "/api/index.py" }
     ]
   }
   ```
7. Create `.env.example`:
   ```
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=
   ADMIN_DELETE_KEY=
   ```
8. Append Python block to `.gitignore`: `__pycache__/`, `.venv/`, `.pytest_cache/`, `.ruff_cache/`, `*.pyc`, `.env`

**Done when:**
- `vercel dev` on localhost hits `http://localhost:3000/api/health` → `{"ok": true}`
- `/api/docs` renders Swagger UI
- `ruff check backend/` clean

---

## WS2-FE — Frontend Data Layer

**Goal:** Types, Zod schemas, Zustand store, API client.

**Tasks:**
1. `lib/types.ts` — exactly as spec §6 TS block.
2. `lib/schema.ts` — Zod schemas mirroring Pydantic:
   - `LinkSchema`, `PageSchema`, `CreatePageResponseSchema`
   - `safeParsePage(unknown): Page | null` helper
3. `lib/store.ts` — Zustand store:
   - state: `page: Page`, `publishedSlug?: string`, `editToken?: string`
   - actions: `setName`, `setBio`, `setAvatar`, `setTheme`, `addLink`, `updateLink`, `removeLink`, `reorderLinks`, `toggleLink`, `loadFromExternal`, `setPublished(slug, token)`, `reset`
   - `persist({ name: "link-in-bio:v1" })` middleware — persists all of the above
4. `lib/api.ts` — fetch wrappers:
   ```ts
   export async function publishPage(page: Page, editToken?: string): Promise<CreatePageResponse>
   export async function fetchPage(slug: string): Promise<Page | null>
   ```
   - Builds URL from `process.env.NEXT_PUBLIC_API_BASE ?? ""` (same-origin default)
   - Throws on network; returns null on 404

**Done when:**
- `tsc --noEmit` clean
- Manual console test in browser: `usePageStore.getState()` shows default page

---

## WS2-PY — Backend Data Layer

**Goal:** Pydantic models, Turso/libSQL client, slug/token utilities, schema migration.

**Tasks:**
1. `backend/models.py` — exactly as spec §6 Python block.
2. `backend/slug.py`:
   ```python
   from nanoid import generate
   ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"  # no lookalikes
   def make_slug() -> str: return generate(ALPHABET, 8)
   ```
3. `backend/security.py`:
   ```python
   import hashlib, secrets
   def make_edit_token() -> str: return secrets.token_urlsafe(24)
   def hash_token(raw: str) -> str: return hashlib.sha256(raw.encode()).hexdigest()
   def verify_token(raw: str, hashed: str) -> bool:
       return secrets.compare_digest(hash_token(raw), hashed)
   ```
4. `backend/db.py`:
   - Reads `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` from env
   - Exposes `get_client()` returning a libsql sync client
   - `init_schema(client)` reads `migrations/0001_init.sql` and executes
   - Helper fns: `get_page(slug)`, `create_page(slug, token_hash, page_json)`, `update_page(slug, page_json)`, `bump_view(slug)`
5. `migrations/0001_init.sql` — exactly as spec §7.
6. `tests/backend/test_models.py`:
   - Pydantic round-trip tests (empty page, page with 50 links, oversize rejection)
   - JSON schema snapshot: writes `tests/backend/__snapshots__/page.schema.json` — if it changes, fail and prompt human review (catches TS/Python drift)

**Done when:**
- `pytest tests/backend/test_models.py -q` green
- `ruff check backend/` clean
- `python -c "from backend.models import Page; print(Page(name='x').model_dump_json())"` works

---

## WS3 — Editor Panel (Codex)

**Goal:** Left-panel editor driving the Zustand store.

**Context:** Reads/writes via `@/lib/store`. Styling via Tailwind + shadcn. dnd-kit for reorder.

**Tasks:**
1. `components/editor/ProfileEditor.tsx` — name, bio (live counter, max 160), avatar upload (FileReader → data URL, max 2MB, jpg/png/webp, show circle preview).
2. `components/editor/LinksEditor.tsx` — maps `page.links` to `<LinkRow>`, wrapped in `<DndContext>` + `<SortableContext>` with `verticalListSortingStrategy`; `onDragEnd` → `reorderLinks`.
3. `components/editor/LinkRow.tsx` — sortable handle, label input, URL input with Zod validation (red ring + message), enable switch, delete button.
4. `components/editor/AddLinkForm.tsx` — inline form (label + URL), submit → `addLink`.
5. `app/page.tsx` final:
   - Two-column grid: left scrollable editor (ProfileEditor, ThemePicker, LinksEditor, AddLinkForm), right `<BioPage page={page} />` preview.
   - Header with app name + `<PublishButton />` (from WS6-FE — stub renders "Publish" button that no-ops until WS6-FE lands).

**Done when:**
- Every field edits live-update preview
- Drag-reorder smooth; keyboard accessible
- Invalid URL blocks add
- `pnpm build` passes with zero `any`, zero console.log

**Style:** Linear / Vercel dashboard vibe. No generic gradients. Use shadcn primitives as base.

---

## WS4 — Preview & Public View

**Goal:** Shared `<BioPage>` + public route `/p/[slug]` fetching from backend.

**Tasks:**
1. `components/preview/BioPage.tsx`:
   - Props: `page: Page`. Pure — no store access (reusable in preview and public).
   - Centered column, max-w-md, avatar, name, bio, then `<LinkButton>` stack.
   - Wrapped in theme class from `themeClassName(page.theme)` (WS5).
2. `components/preview/LinkButton.tsx` — anchor with `target="_blank" rel="noopener noreferrer"`; theme CSS vars for hover; hidden when `!enabled`.
3. `components/preview/Avatar.tsx` — data URL or initials fallback.
4. `app/p/[slug]/page.tsx`:
   - Server component by default. Uses `fetch(\`\${origin}/api/pages/\${slug}\`, { cache: "no-store" })`.
   - 404 → not-found UI with link to `/`.
   - Otherwise renders `<BioPage page={page} />`.

**Done when:**
- Preview on `/` matches public `/p/<slug>` pixel-for-pixel
- Invalid slug shows friendly error
- `pnpm build` passes

---

## WS5 — Themes (Codex)

**Goal:** Distinct visual themes, hot-swappable.

**Tasks:**
1. `lib/themes.ts`:
   ```ts
   export const THEMES = [
     { id: "minimal", name: "Minimal", preview: "#ffffff" },
     { id: "neon",    name: "Neon",    preview: "#0b0020" },
     { id: "sunset",  name: "Sunset",  preview: "#ff6e7f" },
     // stretch: paper, retro, dark
   ] as const;
   export function themeClassName(id: ThemeId) { return \`theme-\${id}\`; }
   ```
2. Append theme CSS to `app/globals.css` below `/* THEMES BELOW */`. Each `.theme-<id>` defines: `--bg`, `--fg`, `--accent`, `--link-bg`, `--link-fg`, `--link-hover`, `--radius`, `--font-family`.
3. `components/editor/ThemePicker.tsx` — swatch grid, selected ring, onClick → `setTheme`.

**Theme feel:**
- **Minimal:** white, black text, subtle gray cards, system-ui, rounded-md.
- **Neon:** deep purple, cyan accents, glow hover, mono font.
- **Sunset:** coral→peach gradient, cream cards, serif name, rounded-2xl.

**Done when:**
- All three themes visually distinct
- Switching is instant
- Public view honors theme from fetched data

---

## WS6-PY — Pages CRUD API

**Goal:** FastAPI routes matching spec §8.

**Tasks:**
1. `backend/routes/__init__.py` — empty, makes it a package.
2. `backend/routes/pages.py`:
   - `router = APIRouter(prefix="/api/pages", tags=["pages"])`
   - `POST /` → `create_page(body: Page) -> CreatePageResponse`
     - Mint slug, mint edit_token, hash token, insert
     - Simple in-memory per-IP rate limit: 10 creates / hour (dict of IP → timestamps). Log-only warn on hit; do NOT block during demo first 24h (flag controlled by env `RATE_LIMIT_ENFORCE=0|1`).
   - `GET /{slug}` → returns `Page` or 404; bumps view_count async (fire-and-forget)
   - `PUT /{slug}` → requires `X-Edit-Token` header, verifies hash, updates data
   - `DELETE /{slug}` → requires `X-Admin-Key` header matching `ADMIN_DELETE_KEY`
3. Wire router in `backend/app.py`:
   ```python
   from backend.routes.pages import router as pages_router
   app.include_router(pages_router)
   ```
4. `tests/backend/test_pages.py` (httpx AsyncClient against FastAPI app):
   - Create → returns slug + token, page matches
   - Get → matches created page
   - Put with correct token → updates
   - Put with wrong token → 403
   - Get missing → 404
   - Oversize avatar → 422
   - Max links enforcement → 422

**Done when:**
- `pytest tests/backend -q` green (all tests)
- `vercel dev` + `curl` round-trip works against `/api/pages`
- `ruff check backend/` clean

---

## WS6-FE — Publish & Fetch

**Goal:** Frontend publish button and WS4's public view wiring use the real API.

**Tasks:**
1. `components/share/PublishButton.tsx`:
   - Reads `page`, `publishedSlug`, `editToken` from store
   - On click → calls `publishPage(page, editToken)` from `lib/api.ts`
   - On success → `setPublished(slug, token)`, copy `${origin}/p/${slug}` to clipboard, toast "Link copied"
   - Loading state + error toast on failure
2. `components/share/ExportPngButton.tsx` (stretch) — calls `POST /api/export/png`, downloads result.
3. `components/share/QrButton.tsx` (stretch) — dialog with QR from `POST /api/qr`.
4. Verify WS4's `/p/[slug]` uses `lib/api.ts` `fetchPage`.

**Done when:**
- Local end-to-end: click publish → slug in clipboard → open in incognito → renders
- Re-publish from same browser updates the same slug (not a new one)
- Error states show helpful toast

---

## WS7 — Polish & Deploy

- Framer Motion entry animations on link cards (stagger 40ms)
- Empty state for links list
- `cmd+k` focuses add-link
- Mobile: editor stacks above preview under 900px
- README: full instructions for local dev (frontend + `vercel dev`), env var setup, Turso creation, deploy button
- Provision Turso DB, run `0001_init.sql`, set env vars in Vercel dashboard
- Deploy to Vercel, verify production end-to-end
- Favicon + basic OG image for the editor route

---

## Parallelism Quick Reference

**Maximum concurrent agents during Phase C:** 4
- Codex instance 1 → WS3
- Codex instance 2 → WS5
- Claude subagent A → WS4
- Claude subagent B → WS6-PY

All four read the spec + plan and can execute without further coordination. File ownership is disjoint. Integration happens at Phase D.

---

## Integration & Merge Discipline

- Each WS commits on its own branch, prefix commits with WS tag (`ws3:`, `ws6-py:`, etc.)
- Merge order at end of Phase C: WS5 → WS3 → WS4 → WS6-PY → WS6-FE
- `app/globals.css` is the only file WS3/WS5 might both touch; WS5 uses append-only discipline below marker
- Contract sync (Pydantic ↔ Zod): any schema change must update both and bump a `SCHEMA_VERSION` constant if breaking

---

## Deploy Checklist (Phase E)

- [ ] `git push` to GitHub
- [ ] Vercel: import repo, framework auto-detected (Next.js), Python runtime auto-enabled for `api/*.py`
- [ ] Turso: `turso db create linkinbio`, run migration, `turso db tokens create linkinbio` → token
- [ ] Vercel env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_DELETE_KEY`, `RATE_LIMIT_ENFORCE=1`
- [ ] Trigger production deploy
- [ ] Smoke test: create, read, update, share link
- [ ] Update README with live URL + Vercel deploy button
