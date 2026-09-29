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
- `src/components/image/ImageCropDialog.tsx` — shared create/edit crop dialog, output status,
  compact fallback tools, and JPEG save lifecycle
- `src/components/ui/dialog.tsx` — shared Radix dialog behavior; the `alert` variant preserves the
  legacy character-delete dialog's appearance and entry animations while adding focus management
- `src/components/image/ImageCropWorkspace.tsx` — Cropper.js bridge for frame handles, image
  gestures, free rotation, touch transforms, and editor snapshots
- `src/lib/imageCrop.ts` — 1280×525 crop contract, rotated-polygon boundary model, selection
  fitting, and one-pass 95%-quality JPEG export

## Source Image Editing

- Create and replacement uploads share `ImageCropDialog`; keep both entry points behaviorally aligned
- The crop frame keeps the `1280:525` ratio but its four edges/corners are directly resizable;
  dragging the image moves it, wheel/pinch zooms it, and two-finger twist or the rotation handle
  continuously rotates it
- Cropper.js owns pointer/touch recognition and selection handles; `imageCrop.ts` remains the geometry
  authority because library bounding boxes do not prove that a rotated image covers every crop corner
- Rotation preserves the user's preferred frame width when possible and otherwise fits the largest
  valid frame at its current center; the 2-output-pixel bleed is part of every coverage calculation
- Keep the crop Dialog free of scale-based opening animations because the crop workspace measures its
  container on mount; the crop-only overlay uses the main site's glass treatment without changing
  default/sheet dialog overlays
- 裁剪框先切换关闭状态，待 Radix 退场完成（`onCloseAutoFocus`）后再调用取消/确认回调，避免父表单提前卸载；减少动态效果时不等待固定计时器。遮罩退场使用不同于入场的动画名，确保 Presence 保留节点。
- 裁剪期间禁止点击遮罩退出，避免拖动误触丢失调整；保留取消、关闭按钮和 Esc，导出期间阻止退出。内容淡入 200ms、淡出 150ms，不缩放工作区。
- A workspace resize must proportionally migrate the current selection and image matrix around the
  canvas center; never call the editor reset path from `ResizeObserver`, or an in-progress touch
  transform can be silently lost while responsive layout settles
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
