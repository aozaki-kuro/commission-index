# Post-October 1 Full-Repo Review & Remediation (2026-11-28)

Audit covering commits from `2026-10-01` onward across `apps/web`, `apps/admin`, `apps/admin-worker`, `packages/domain`, CI/tooling, tests/baselines, `AGENTS.md`, and `docs/`.

## Findings: Premature Closures, False Comments & Weak Tests

Ten items previously marked resolved or defended in comments/tests failed verification against the code:

1. **`ADM-3` (`audit-2026-11-11-full-repo.md:210`)**: Marked `已修`, actually unimplemented — `AdminEditPage.tsx` `refreshData` accepted no scope and set `all = true`; `CommissionManager.tsx` called `onRefresh?.()`; `AdminEditPage.test.tsx` asserted only cross-tab broadcast.
2. **`F-7` (`audit-2026-11-11-full-repo.md:68`)**: Marked `已修`, half-fixed — fixed `dropbox.com` substring matching, still dropped unknown-host links (showing "Want this" on published works), and added a false rationalizing comment in `linkDisplay.ts` claiming admin `Most wanted` counted such works as votable (contradicted by `apps/admin/src/lib/unpublishedInterest.ts` and `apps/admin/AGENTS.md`).
3. **`S-7` (`audit-2026-11-11-full-repo.md:87`)**: Marked `已修`, half-done — upload `Content-Length` precheck existed, while text fields, array sizes, and JSON request bodies had no bounds.
4. **`BLD-2 / BLD-3 / BLD-5 / BLD-7` (`audit-2026-11-11-full-repo.md:72,211,216`)**: Marked `已修` / `id 已修`, half-done — `rssFeed.ts` kept invalid `<webMaster>Crystallize</webMaster>` (no email), `apps/web/public/_headers` lacked `Content-Type: application/rss+xml; charset=utf-8` on `/rss.xml`, `DesktopSidebarNav.astro` kept spaces in `id="Home Controls"` and `id="Character List"`, and `browserconfig.xml` / `site.webmanifest` kept `#da532c` / `#ffffff`.
5. **`C2` / `DS-W14` (`audit-2026-11-01-design-consistency.md:151`)**: Age gate (`z-80`) sat below mobile floating buttons (`z-90`), `MobileKeywordButton` remained visible above the gate, and `apps/web/AGENTS.md` documented the inverted order while visual specs bypassed the gate.
6. **`dialog.tsx`**: Fixed Radix Presence overlay exit keyframes and `motion-safe:` only on `crop`, leaving `default` and `sheet` reusing the reversed entry animation (dropping the overlay immediately on close).
7. **`admin-create.spec.ts` vs `apps/admin/AGENTS.md:35`**: Documentation claimed the spec asserted the crop toolbar stays two rows at 390px and 200% text, while the test only ran `toBeInViewport()` without horizontal overflow or workspace height checks (`min-w-28` + `Cancel` overflowed).
8. **`A-9` (`AdminOverviewPage.tsx`)**: Fixed only `FloatingRebuildButton.tsx`, leaving `AdminOverviewPage` showing stale rebuild confirmation text next to the pending-changes warning.
9. **`AddCommissionForm.tsx`**: Rendered image-replacement success inside a persistent `<FloatingNotice placement="toast">` instead of `useToast()`, violating the transient toast rule.
10. **Phantom / Weakened Tests**:
    - `commissionSearchController.test.ts` (`popstate` to `?q=`) never verified DOM filtering with `isIndexReady`.
    - `adminApi.test.ts` (`PATCH` link validation) omitted `workGroupId`/`partNumber`, failing before `isHttpUrl` ran and asserting only status `400`.
    - `commissions/index.test.ts` and `updateSummary.test.ts` asserted `(preview)` beat legacy non-preview works.
    - `sqliteD1.ts` omitted `PRAGMA foreign_keys = ON`.
    - `home-navigation.spec.ts` checked back-to-top geometry while `opacity-0` at `scrollY = 0`.

## Remediation Landed (2026-11-28)

- **Web**: Crisp Sharp pipeline (`kernel: 'lanczos3'`, WebP `quality: 92`, `smartSubsample: true`, `effort: 6`) + monospace fallback; z-index & `inert` fixes across Age Gate, hamburger, and mobile keyword button; pre-enhancer archived `<details>` sync fixing the visual toggle race; valid `#home-controls` / `#character-list` IDs; `#introduction` footer anchor; valid RSS `<webMaster>` omission & `_headers` `Content-Type`; manifest/tile `#9D3757` colors; non-preview winner priority in `selectLegacySeriesWinner`; render all valid `http(s)` links in `linkDisplay.ts`; LCP preload targeting first active section with visible works; early search hydration (`focusin`, `input`, `beforetoggle`), `earlyInputQuery`, disabled hidden buttons, `data-copy-icon`; search LRU cache cap, negation fix (`k-on!`), operator `"|"` warm-Fuse parity, strict comparator, and RSS/copy/early-search tests.
- **Admin**: Unified `motion-safe:` overlay in/out animations across `dialog.tsx` variants; `ADM-3` scoped same-tab refresh (`AdminEditPage.tsx`, `CommissionManager.tsx`) with regression test; `A-9` fix in `AdminOverviewPage.tsx` + timeout timer cleanup in `websiteRebuild.ts`; transient `useToast()` for image-replacement success; assertive error notices in `FloatingNotice.tsx`; responsive wrapping on `ImageCropDialog.tsx` + overflow/bounds/canvas-height assertions at 390px + 200% text in `admin-create.spec.ts`; React `act(...)` warning fixes in hook tests.
- **Worker & Scripts**: `ALLOW_LOCAL_ORIGINS=1` CORS gating on all methods; 1 MiB JSON cap (`413`) + S-7 length/count/URL bounds; `Number.isSafeInteger` ID checks; 10 s timeouts on Rybbit & rebuild dispatch plus canonical UUID filtering; `POST .../source-image` object retention on ambiguous D1 error; `GET /suggestion` `WHERE commissions.hidden = 0`; `W/` weak ETag matching; path-traversal guard + atomic `.download` rename in `syncMissingSourceImages.ts`; UTF-16 `canonicalJson` sorting; `listR2Orphans.ts` cursor-cycle guard + 30 s timeouts; `mapWithConcurrency` stop-on-first-error; `PRAGMA foreign_keys = ON` in `sqliteD1.ts`.
- **CI & Docs**: Gated `deploy-web-snapshot` cache limit/save on actual web deploy; enforced `.codeSha == null` in PR build verification; excluded `*.md`/`*.mdx` from root catch-all `lint-staged` rule; disabled Renovate automerge on `@playwright/test` and `@tailwindcss/vite`; added worker tests to `tsconfig.json`; updated `AGENTS.md` and `docs/`.
