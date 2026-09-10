# admin

Standalone admin frontend: React 19 + Vite 8 SPA served from `admin.crystallize.cc`.

## Responsibilities

- Talks only to admin worker API via `ADMIN_API_BASE_URL`
- Default dev: `pnpm run dev:admin` from repo root (pairs frontend with local worker + remote D1/R2)
- Preserve existing admin visual design, spacing, typography
- Where admin uses shadcn/Radix primitives, preserve them (don't downgrade to native controls)

## Key Structure

- `src/App.tsx` — path-based page routing
- `src/app/sections.ts` — route definitions and metadata
- `src/app/ui.ts` — shared Tailwind class contracts
- `src/lib/adminActions.ts` — worker-backed form actions
- `src/lib/adminApi.ts` — API URL resolution and fetch helpers
- `src/pages/` — route pages (overview, create, edit, aliases, suggestion)
- `src/components/` — migrated admin React components
- `src/components/image/ImageCropDialog.tsx` — fixed-frame source-image editor; delegates
  geometry and JPEG encoding to `src/lib/imageCrop.ts`
- `src/lib/imageCrop.ts` — 1280×525 crop contract, arbitrary-rotation boundary model, and
  one-pass 95%-quality JPEG export

## Source Image Editing

- Create and replacement uploads share `ImageCropDialog`; keep both entry points behaviorally aligned
- The crop frame is fixed at `1280:525`; users move, zoom, and continuously rotate the image beneath it
- Do not replace `normalizeCropTransform` with axis-aligned bounding-box clamps: arbitrary rotation
  requires constraining crop translations in the image's local coordinate system to prevent blank corners
- Keep the crop Dialog free of scale-based opening animations because `react-easy-crop` measures its
  container on mount
- Object URL cleanup must survive React StrictMode's effect replay: defer revocation and cancel that
  pending cleanup when the effect is immediately re-established; still revoke on real unmount
- R2 receives only the processed `1280×525 image/jpeg` file; transparent input pixels are flattened
  onto white and low-resolution crops must surface an upscaling warning

## API Documentation

Before touching fetch logic or form actions, read:

- `docs/api-reference.md` — endpoint signatures and field types
- `docs/ai-agent-guide.md` — retry strategy, links encoding, `hidden` field quirks, alias batch semantics

## Guardrails

- Route paths rooted at `/` on `admin.crystallize.cc` — no `/admin/*` public-site coupling
- Validate every migrated page with Playwright visual regression
- Validate admin pages with Playwright visual regression
