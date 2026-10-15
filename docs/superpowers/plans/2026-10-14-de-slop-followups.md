# De-slop follow-ups (2026-10-14)

Follow-up to the admin/web de-slop pass. Owner ruling: web monospace becomes **hybrid**; everything else is
left to the controller's judgment, assisted by the design skills (taste-skill tells/critique, impeccable,
redesign-skill States checklist).

Two independent tracks in two checkouts; tasks within a track run sequentially.

- **Admin track:** main checkout `/Users/aozaki/GitHub/commission-index`, branch `style/admin-de-slop`.
- **Web track:** worktree `/Users/aozaki/GitHub/commission-index/.claude/worktrees/agent-afa6fcf4437f7ac16`,
  branch `style/web-motion-tidy`.

## Global Constraints

- Minimal diff; no drive-by refactors. Match surrounding code style (Tailwind 4 class lists, existing
  multi-line Astro class formatting).
- **Do not commit, stash, reset, or delete files.** Leave all changes in the working tree.
- Do not run Playwright visual specs or `--update-snapshots` (the controller runs visual checks once at the end;
  admin visual runs bind port 4173 and would collide across tracks).
- Run pnpm commands sequentially within a checkout (they race on `node_modules/.pnpm`).
- Admin design contract: `apps/admin/.impeccable.md` (no monospace outside literal code, no resting shadows,
  motion short and reduced-motion compatible, full function across pointer/touch/keyboard).
- Tailwind 4: `scale-*` sets the `scale` property, `translate-*` sets `translate`; the `pointer-coarse:` variant
  exists for touch-only sizing.

## Web track

### Task W1: Hybrid monospace and mobile menu height

Monospace (Berkeley Mono) is the brand voice for **data**; navigation and UI chrome move to the body sans
(IBM Plex Sans, weights 400/600/700 loaded, so `font-bold` stays real bold).

Remove `font-mono` (let the element inherit the body sans) in:

- `apps/web/src/features/home/nav/DesktopSidebarNav.astro` (every occurrence)
- `apps/web/src/features/home/nav/hamburger/MobileHamburgerMenu.astro` (every occurrence)
- `apps/web/src/features/home/nav/hamburger/constants.ts` (`listItem`)
- `apps/web/src/features/home/commission/MobileViewModeTabs.astro`
- `apps/web/src/features/home/warning/AgeGateScript.astro` (the two buttons)

Keep `font-mono` unchanged in: `Update.astro` (update log), `CommissionEntries.astro`, `IllustratorInfo.astro`,
`batch/batchRender.ts` (commission metadata line), `Footer.astro` (colophon line), and every search file
(`CommissionSearchIsland.astro`, `commissionSearch*Renderer.ts`, `commissionSearchController.ts`) — query
syntax and the search input are literal code.

Also in `MobileHamburgerMenu.astro`: `max-h-[calc(100vh-8rem)]` → `max-h-[calc(100dvh-8rem)]` (iOS URL bar).

Record the rule in `apps/web/PRODUCT.md` (one or two lines, near the identity-assets line): monospace is for
data (dates, IDs, update log, colophon, search syntax); navigation and controls use Plex Sans.

Update any unit test that asserts the removed classes. Verify from the worktree root: `pnpm run lint`,
`pnpm run typecheck`, `pnpm run test`, `pnpm -C apps/web exec astro check .` (sequentially).

## Admin track

### Task A1: Touch targets and press feedback

- Controls smaller than 44px must reach 44×44 on touch devices **without changing fine-pointer (desktop)
  layout**: use `pointer-coarse:` sizing (e.g. `pointer-coarse:min-h-11`, `pointer-coarse:size-11`). Cover at
  least: the floating notice dismiss button, the calendar toggle, `FloatingRebuildButton`, and the `h-9`/`h-10`
  buttons. Find them with `grep -rn "h-9\|h-10\|size-8\|size-7" apps/admin/src --include='*.tsx'`; skip inputs
  whose height is part of a fixed row layout only if growing them breaks the layout, and list each skip in the
  report.
- Shared press feedback: the shared button styles in `apps/admin/src/app/ui.ts`, plus `SubmitButton.tsx` and
  `SaveButton.tsx`, get `motion-safe:active:scale-[0.98]` (disabled buttons must not scale: use
  `enabled:` or equivalent). If a style's `transition-*` list excludes `scale`, the press may snap; that is
  acceptable, do not widen transitions to `transition-all`.
- Verify: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run test:admin-ui` (sequentially).

### Task A2: Small correctness fixes

1. Dynamic viewport units: `apps/admin/src/components/ui/dialog.tsx` `max-h-[85vh]` and `sm:max-h-[85vh]` →
   `dvh`; `DuplicateCommissionNotice.tsx` `max-h-[min(50vh,24rem)]` → `dvh`.
2. Invalid `DialogTitle` nesting: find any `DialogTitle` (renders `<h2>`) that contains block/heading
   elements, or a heading/`<p>`-only context that contains a `<div>`; fix the markup so the title holds
   phrasing content only. Files: `ImageCropDialog.tsx`, `CommissionEditDrawer.tsx`, `CharacterDeleteDialog.tsx`,
   `KeywordReplacePopover.tsx`, `AdminCreateDashboard.tsx`, `ui/dialog.tsx`. If none is invalid, say so.
3. Select trigger hover state in `apps/admin/src/components/ui/select.tsx`: add a hover affordance consistent
   with neighbouring inputs (border or background shift, light and dark), no shadow.
4. `CommissionThumbnailGrid.tsx`: a focused tile must be distinguishable from a selected tile (today both use a
   ring). Selected keeps its current treatment; keyboard focus uses an outline with offset (`focus-visible:`)
   in the neutral focus colour.

Verify as A1.

### Task A3: Unsaved-changes guard

When the create form or the commission edit form holds unsaved changes, warn before the page unloads
(reload/close/external navigation) with a `beforeunload` handler. Reuse any existing dirty-state signal; if
none exists, derive "dirty" from the smallest reliable source and say how in the report. Register the handler
only while dirty; remove it on save success and on unmount. No custom in-app route blocker (MVP). Add a
Vitest test for the hook/handler behaviour (registered when dirty, removed when clean/unmounted).

Verify as A1.

## Parked (controller rulings, not dispatched)

See the SDD ledger.
