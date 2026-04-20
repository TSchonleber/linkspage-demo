# Link-in-Bio Builder — Design Spec

**Date:** 2026-04-19 (rev 2: added Python backend)
**Status:** Approved for implementation
**Purpose:** Live demo app for Discord stream showcasing agentic coding (Claude + Codex)

---

## 1. Product

A web app that lets anyone build a personal "link in bio" page (Linktree-style): edit in the browser with live preview, pick a theme, publish to a short shareable URL. No accounts — first publish mints a slug and an edit token you keep locally.

**Demo value:** Every agent prompt produces a visible UI change. Viewers see a real full-stack product assemble in real-time (Next.js frontend + Python backend). Easy to fork and personalize post-stream.

## 2. Users

- **Primary (demo viewer):** someone new to agentic coding who wants to watch a clear, relatable build.
- **Secondary (end user):** anyone who wants a quick personal link page without signup.

## 3. Scope

### MVP (must ship during stream)
- Edit profile: name, bio, avatar (upload → data URL, stored with the page)
- Add / edit / remove / reorder links
- Live preview panel next to editor
- 3+ theme presets (Minimal, Neon, Sunset)
- Work-in-progress state auto-saved to localStorage
- **Publish:** POST to Python backend → returns `{ slug, edit_token }` → URL copied to clipboard
- **Public view:** `/p/<slug>` fetches from backend and renders
- **Update:** subsequent publishes use stored edit token to update the existing slug

### Stretch (if time permits)
- Export page as PNG (Python endpoint using Pillow + HTML render)
- QR code for the share URL (Python, `qrcode` lib)
- Server-rendered OpenGraph image per slug for social previews
- Framer Motion entry animations
- Social icon picker (Twitter, GitHub, etc.)
- 3 more themes (Paper, Retro, Dark)

### Out of scope (explicitly not building)
- Accounts / email auth
- Custom domains
- Analytics
- Rate limiting beyond basic per-IP on create
- AI features inside the app (demo is ABOUT building, not using, AI at runtime)

## 4. Stack

### Frontend
| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router | Default, Vercel-native |
| Language | TypeScript (strict) | Catch errors live on stream |
| Styling | Tailwind CSS v4 | Zero-config |
| Components | shadcn/ui | Pre-built, easy to restyle |
| Drag reorder | `@dnd-kit/core` + `@dnd-kit/sortable` | Accessible |
| State | Zustand | Simple, no provider boilerplate |
| Validation | Zod | Mirrors Pydantic schema shape |
| HTTP | `fetch` | No client lib needed |

### Backend
| Concern | Choice | Why |
|---|---|---|
| Runtime | Python 3.12 on Vercel Python Functions | Native Vercel support, no separate host |
| Framework | FastAPI | Async, Pydantic-native, great DX |
| Validation | Pydantic v2 | Contract source of truth; mirrors frontend Zod |
| Database | Turso (libSQL) free tier | SQLite over HTTP, serverless-friendly, zero infra |
| DB client | `libsql-client` (sync) | Simple, works in serverless cold start |
| ID generation | `nanoid` (Python port) | Short URL-safe slugs |
| PNG export (stretch) | `Playwright` or `html2image` | Server-side render for reliability |
| QR code (stretch) | `qrcode[pil]` | Pure-Python, no external |
| Hosting | Vercel (free tier) | Same deploy target as frontend |

**Env vars (backend):**
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `ADMIN_DELETE_KEY` (optional, for ops takedowns)

Free tier coverage: Vercel Hobby + Turso free tier = $0/mo for demo-scale traffic.

## 5. Architecture

```
Repo root
├── app/                              # Next.js frontend (TypeScript)
│   ├── layout.tsx
│   ├── page.tsx                      # editor (split view)
│   ├── p/
│   │   └── [slug]/
│   │       └── page.tsx              # public page — fetches from /api/pages/<slug>
│   └── globals.css
│
├── components/
│   ├── editor/
│   │   ├── ProfileEditor.tsx
│   │   ├── LinksEditor.tsx
│   │   ├── LinkRow.tsx
│   │   ├── AddLinkForm.tsx
│   │   └── ThemePicker.tsx
│   ├── preview/
│   │   ├── BioPage.tsx               # shared render used by preview AND /p
│   │   ├── LinkButton.tsx
│   │   └── Avatar.tsx
│   ├── share/
│   │   ├── PublishButton.tsx         # POST → slug → clipboard
│   │   ├── ExportPngButton.tsx       # stretch, calls /api/export/png
│   │   └── QrButton.tsx              # stretch, calls /api/qr
│   └── ui/                           # shadcn primitives
│
├── lib/                              # Frontend-only TS
│   ├── types.ts                      # mirrors Pydantic models
│   ├── schema.ts                     # Zod schemas
│   ├── store.ts                      # Zustand + localStorage persist
│   ├── themes.ts                     # theme registry
│   └── api.ts                        # fetch wrappers for /api/pages
│
├── api/                              # Vercel Python serverless functions
│   └── index.py                      # FastAPI app, all routes mounted here
│
├── backend/                          # Python app code (imported by api/index.py)
│   ├── __init__.py
│   ├── app.py                        # FastAPI() instance + router wiring
│   ├── models.py                     # Pydantic models (Page, Link, ThemeId)
│   ├── db.py                         # Turso/libSQL client + query helpers
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── pages.py                  # POST/GET/PUT /pages
│   │   ├── og.py                     # stretch: OG image per slug
│   │   ├── export.py                 # stretch: PNG export
│   │   └── qr.py                     # stretch: QR generation
│   ├── slug.py                       # slug generation helpers
│   └── security.py                   # edit-token creation + verification
│
├── migrations/
│   └── 0001_init.sql                 # Turso schema
│
├── tests/
│   └── backend/
│       ├── test_pages.py             # pytest + httpx
│       └── test_models.py
│
├── requirements.txt                  # Python deps
├── pyproject.toml                    # ruff + pytest config
├── package.json                      # Node deps
├── vercel.json                       # rewrites /api/* to api/index.py
└── public/
    └── placeholder-avatar.svg
```

### Data flow (publish)
1. User edits in `/` — Zustand store reflects live to `<BioPage>` preview.
2. User hits **Publish** → frontend calls `POST /api/pages` with `Page` JSON.
3. Backend validates with Pydantic, mints `slug` (8 chars) + `edit_token` (32 char secret), inserts row, returns `{ slug, edit_token }`.
4. Frontend stores `{ slug, edit_token }` in localStorage keyed by session, copies `${origin}/p/${slug}` to clipboard, toasts success.
5. On subsequent publishes from same browser, frontend sends `edit_token` header; backend verifies and does UPDATE.

### Data flow (public view)
1. User visits `/p/<slug>`.
2. Frontend calls `GET /api/pages/<slug>` → Page JSON.
3. Renders same `<BioPage>` component used in preview.
4. If 404 → friendly "page not found" state with link to `/`.

### Why single `api/index.py` FastAPI entry point
Vercel Python treats each file in `api/` as its own function. One FastAPI app mounted at `api/index.py` with `vercel.json` rewrites (`/api/:path*` → `/api/index.py`) keeps the routing and imports clean — one warm function, shared DB connection setup, proper FastAPI OpenAPI docs at `/api/docs`.

## 6. Data Model

### Python (source of truth) — `backend/models.py`
```python
from pydantic import BaseModel, Field, HttpUrl, constr
from typing import Literal, Annotated
from enum import Enum

ThemeId = Literal["minimal", "neon", "sunset", "paper", "retro", "dark"]

class Link(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=64)]
    label: Annotated[str, Field(min_length=1, max_length=80)]
    url: Annotated[str, Field(min_length=1, max_length=2048)]  # validated loosely; no HttpUrl to allow mailto: etc
    enabled: bool = True

class Page(BaseModel):
    version: Literal[1] = 1
    name: Annotated[str, Field(max_length=80)]
    bio: Annotated[str, Field(max_length=160)] = ""
    avatar: Annotated[str, Field(max_length=500_000)] = ""  # data URL or empty
    theme: ThemeId = "minimal"
    links: Annotated[list[Link], Field(max_length=50)] = []

class CreatePageResponse(BaseModel):
    slug: str
    edit_token: str
    page: Page
```

### TypeScript (mirror) — `lib/types.ts`
```ts
export type ThemeId = "minimal" | "neon" | "sunset" | "paper" | "retro" | "dark";

export type Link = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
};

export type Page = {
  version: 1;
  name: string;
  bio: string;
  avatar: string;
  theme: ThemeId;
  links: Link[];
};

export type CreatePageResponse = {
  slug: string;
  edit_token: string;
  page: Page;
};
```

**Contract discipline:** Pydantic is source of truth. If a field changes, Python gets updated first; TS mirror follows in the same commit. A small contract test (`tests/backend/test_models.py`) snapshots the JSON schema and fails if the TS types drift — frontend CI also runs `tsc --noEmit` against `lib/types.ts` consuming API responses.

## 7. Database Schema — `migrations/0001_init.sql`

```sql
CREATE TABLE IF NOT EXISTS pages (
  slug          TEXT PRIMARY KEY,
  edit_token_h  TEXT NOT NULL,         -- sha256 of the raw token
  data          TEXT NOT NULL,          -- JSON-serialized Page
  created_at    INTEGER NOT NULL,       -- unix ms
  updated_at    INTEGER NOT NULL,
  view_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS pages_updated_at ON pages(updated_at);
```

Edit tokens are stored hashed (sha256); the raw token is only known to the browser that created the page.

## 8. API Surface

| Method | Path | Body / Params | Response | Notes |
|---|---|---|---|---|
| POST | `/api/pages` | `Page` JSON | `CreatePageResponse` | Rate-limit: 10/hour per IP |
| GET | `/api/pages/{slug}` | — | `Page` | 404 if missing. Increments view_count. |
| PUT | `/api/pages/{slug}` | `Page` JSON + `X-Edit-Token` header | `Page` | 403 on token mismatch |
| GET | `/api/og/{slug}` | — | `image/png` | Stretch — OG image |
| POST | `/api/export/png` | `Page` JSON | `image/png` | Stretch |
| POST | `/api/qr` | `{ url: string }` | `image/png` | Stretch |
| GET | `/api/health` | — | `{ ok: true }` | Readiness check |

## 9. Themes

Frontend-only concern (see original spec). Each theme is a set of CSS variables applied via class on the root wrapper of `<BioPage>`. Backend stores `theme: ThemeId` as part of the Page; public view uses the same CSS.

## 10. Security & Abuse Notes

- `avatar` field capped at 500KB data URL to keep DB rows reasonable
- URL fields validated but NOT followed/fetched server-side (no SSRF surface)
- Rate limit: per-IP bucket on POST `/api/pages` using a tiny in-memory counter per function instance (good-enough for demo; not production-grade)
- `edit_token` is 32 bytes of `secrets.token_urlsafe`, hashed with sha256 before storage
- `ADMIN_DELETE_KEY` env var allows manual takedown via `DELETE /api/pages/{slug}` with `X-Admin-Key` header (unlisted in public docs)
- No PII collected. No logging of page content beyond what DB stores.

## 11. Definition of Done

- `pnpm dev` runs frontend at `:3000`
- `vercel dev` runs frontend + Python backend locally
- `pnpm build` passes with zero TS errors
- `pytest tests/backend -q` passes green
- `ruff check backend/` clean
- Deployed to Vercel at a public URL with Turso connected
- MVP checklist (section 3) all green
- Viewer can: edit → publish → copy URL → open incognito → sees identical page → come back later → publish again → same slug updates
- README has one-command local run + one-click Vercel deploy instructions

## 12. Demo Script (for the stream)

1. Scaffold frontend (5 min)
2. Scaffold Python backend + FastAPI hello (5 min) — *stream moment: one repo, two runtimes*
3. Data model in Pydantic + Zod mirror (5 min) — *shared contract visible*
4. Zustand store + editor UI (10 min)
5. Preview component + themes (10 min) — *visual wow*
6. Publish flow end-to-end (10 min) — *first network round-trip, slug in clipboard*
7. Public page route (5 min) — *the shareable artifact*
8. Deploy to Vercel + Turso connect (5 min)
9. Stretch goals if time (PNG export / QR / OG image) (10 min)

Total: ~65 min + buffer.

