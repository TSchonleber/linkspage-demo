## Codex WS3/WS5 Handoff

Built editor and themes for the link-in-bio frontend:
- Added editor components for profile editing, link CRUD, sortable link rows, and theme selection.
- Replaced placeholder `app/page.tsx` with a complete split layout: left editor stack + right live preview.
- Added `lib/themes.ts` registry and theme class helper for `minimal`, `neon`, and `sunset`.
- Appended theme CSS tokens/styles under the `/* THEMES BELOW */` marker in `app/globals.css`.

Implementation decisions:
- Kept URL validation permissive for `http`, `https`, `mailto`, and `tel` to match backend constraints.
- Used a local preview renderer in `app/page.tsx` so WS3 remains unblocked even if WS4 preview files are not yet merged.
- Kept publish action as a UI stub button; WS6-FE can replace it with `PublishButton` wiring.

Follow-up risks:
- When WS4 lands, align class names/style contract so public view and local preview stay visually identical.
- Consider extracting shared URL validation helpers to avoid drift between add/edit flows.
