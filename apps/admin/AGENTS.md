# admin

Standalone admin frontend: React 19 + Vite 8 SPA served from `admin.crystallize.cc`.

- Talks only to the admin worker via `ADMIN_API_BASE_URL`; routes are rooted at `/` (no `/admin/*` coupling with the public site).
- Product context is `PRODUCT.md`; design tokens, shell width, glass and motion rules live in `.impeccable.md` and `src/styles/globals.css`. Follow them rather than restating them here.
- Every in-app link uses client-side history navigation, including in-page entries (quick actions, list tail links); a native full-page `<a href>` loses state.
- Keep shadcn/Radix primitives; do not downgrade to native controls.
- API contracts (identity fields, `publicId` vs `id`, metadata-only PATCH, replacement semantics, retry rules): `apps/admin-worker/AGENTS.md`, `docs/api-reference.md`, `docs/ai-agent-guide.md`. Read before touching fetch logic or form actions.

## Key Structure

- `src/lib/websiteRebuild.ts` — shared rebuild request/pending state; `src/lib/pendingRebuildSignal.ts` — pending flag + revision
- `src/components/FloatingNotice.tsx` — Portal notices kept out of form flow
- `src/components/image/ImageCropDialog.tsx`, `ImageCropWorkspace.tsx` (Cropper.js bridge), `src/lib/imageCrop.ts` (geometry authority)
- `src/components/ui/dialog.tsx` — shared Radix dialog (`alert` / `crop` / `default` / `sheet` variants)
- `KeywordReplacePopover.tsx` keeps its filename but is a Dialog

## Source Image Editing

- Create and replacement uploads share `ImageCropDialog`; keep both entry points aligned.
- Output is a single `1280×525 image/jpeg` (transparent pixels flattened onto white; warn on upscaling). The frame ratio is fixed but its edges are resizable; rotation is continuous, not 90° steps.
- `imageCrop.ts`, not Cropper.js bounding boxes, decides whether a rotated image covers every crop corner (including the 2px bleed).
- No scale-based opening animation on the crop Dialog: the workspace measures its container on mount.
- Close sequence: flip the closed state first, call cancel/confirm only after Radix exit finishes (`onCloseAutoFocus`), otherwise the parent form unmounts and truncates Presence. The overlay exit animation needs a different name from its entry animation or Presence drops the node. Outside-click does not dismiss (drag mis-taps); export blocks dismissal.
- `ResizeObserver` must migrate the selection and matrix proportionally around the canvas center; never call the editor reset path there, or an in-progress touch transform is lost.
- Object URL revocation must be deferred and cancelled on immediate re-establishment, so StrictMode's effect replay does not reuse a revoked URL; still revoke on real unmount.

## Commission Forms

- Never infer a work-group relationship from matching artist/date/character/link; only explicit selection changes it. Part is a low-frequency opt-in: unchecking stops submitting the number, re-checking restores the draft.
- Show the 7-char short ID (`formatCommissionPublicId`) for display only; keep the full UUID in title/accessible name, never use truncated text as identity or API key. The edit dialog shows it once in the header character row, not in a truncatable title.
- Unknown creators display as `Anon`; send an empty `creatorName` for unknown.
- Date picker: opening focuses the selected date (today if empty/invalid) without changing the value; recompute local today on each open/select so it survives midnight.
- Mutations are single-attempt unless the API adds an idempotency contract.
- Create form auto-reset applies only on business success; failures keep file and field drafts, and an invalid file never replaces a previously confirmed image.
- New character uses a secondary Dialog with the commission form kept mounted. After saving, refresh bootstrap explicitly: `notifyDataUpdate` ignores the current tab. The create API returns no new ID, so do not guess-select the character by name.

## Layout Stability

- Fix drift at the data/layout root. Never use empty reserved slots or permanent `min-height` hint rows, and never remove animations to hide drift; verify both normal and reduced motion.
- Notices are out of document flow (page: fixed; modal: inside dialog content, outside the scroll body). Background refresh is silent; success auto-dismisses, errors persist until dismissed or a successful retry, and details stay keyboard accessible.
- `Select character` keeps one placeholder across loading; loading, unavailable and genuinely empty are distinct states.
- Skeletons share layout contracts (`gridStyles`, `thumbnails` container breakpoints, character header) with real content so load is geometry-neutral; breakpoints use rem so enlarged text drops columns. Columns use named container queries, not viewport width.
- Use a single window scroll container; a second main scroll container breaks Edit anchor restoration.
- All pages share one shell width and the same title/divider/surface edges; adjust field columns inside, not the shell per page.
- Acceptance: density checks use CSS logical viewport (DPR 2 does not double usable width); text-zoom checks wait for route content and inspect clipping inside controls — `scrollWidth === innerWidth` does not prove usability. Size buttons by min-width, not fixed width.
- Hints that judge data (e.g. duplicate warnings) favour precision over recall; a fuzzy match must not get a definitive label.

## Edit Page

- Archived is the only marked status (grey name + `data-character-status-icon`, plus persistent sr-only `data-character-status-label` referenced by `aria-describedby`); Active is unmarked. Archived means folded by default on the public site. Compute status from the divider position at render time, not a pre-sort snapshot. Keep the `data-stale-divider` contract.
- Search is a native `type="search"` input fed from bootstrap; clicking a result loads the full record. Do not simulate search by auto-expanding characters.
- Ordering has an explicit sort mode with up/down buttons on desktop and mobile; moving across the Active/Archived divider steps over the adjacent list item so an empty group stays reachable.
- Rename and reorder share one character write queue (a rename PATCH carrying a stale status must not overwrite a later archive). Rename requests carry a local edit-session identity so stale responses cannot close later drafts; failure keeps the draft; reorder coalesces to the latest payload; no automatic write retries. Rename save/cancel pointer actions must not trigger blur-commit first.
- While a reorder write is in flight, bootstrap merges only metadata and additions/removals, keeping local order and the divider; release protection on success or failure and refresh via the latest `onDataChanged`.
- Do not clear persisted expansion state with an empty list before data is ready.
- Saves update search content immediately; keyword batch changes refresh bootstrap and loaded groups in place, preserving query, old grid, expansion and focus. Stale reads must not overwrite later edits, and groups mid-refresh wait for fresh detail rather than editing from an old keyword/part snapshot.
- Every successful save notifies and calls `markPendingRebuild`; do not detect it by watching `status` transition. Write back from the submitted snapshot, not the draft that kept changing while waiting. Generate a new work-group UUID once before the request and reuse it.
- Keyword replace must send full metadata including `workGroupId` / `partNumber` (omitting clears the part). On partial success refresh data and mark pending rebuild; retry only unfinished rows; keep the error panel.
- A save response must not reopen a closed or switched edit dialog; upload/delete pending states wait for their Promise, and conflicting operations are never submitted together.
- Scroll restoration: `App` restores after SPA route commit and Edit signals `onReady`; reload restoration from storage belongs to Edit alone, and the two paths must not race. `history.scrollRestoration = 'manual'` applies only on the edit route (set in `App.tsx`). On unload, persist the stable anchor on `beforeunload`; `pagehide` is a fallback only, because fonts may be gone by then and re-measuring would overwrite a correct snapshot.

## Publish, Suggestion, Aliases

- Every rebuild entry (overview button, floating button) subscribes to the same `websiteRebuild` request and pending state, so route changes cannot unlock a second dispatch. The overview button replaces the floating one; never show both.
- `markPendingRebuild` bumps a revision on every save even if already pending; a rebuild captures the revision and clears only that snapshot, so saves made while waiting keep the pending state.
- Suggestion: max six, case-normalized dedupe, explicit save only (Enter in the filter input never submits); background refresh must not overwrite a dirty draft.
- Aliases: three tabs stay mounted (drafts survive switching). The latest server rows are the baseline for untouched fields; submit only dirty rows; an empty string is an explicit delete; keep all aliases. Filtering uses the stable baseline so editing a matching alias does not remove the row and steal focus. The save toolbar is top-sticky (bottom collides with the notice stack).
