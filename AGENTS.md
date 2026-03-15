# AGENTS

This repository contains an Astro 6 static site with React 19 islands, written in TypeScript and managed with Bun.

## Development Notes

- **Runtime & package manager:** Node 24 via [mise](https://mise.jdx.dev) and `bun` for all commands.
- **Framework:** Astro + Tailwind CSS + selective React islands (`@astrojs/react`).
- **Astro 6 guardrails:**
  - Keep `i18n.routing.redirectToDefaultLocale` explicit whenever `/` is a real page and must not silently inherit future default changes.
  - Keep `src/content.config.ts` present even when empty. It exists to satisfy Astro's content bootstrap and suppress the dev-only `Content config not loaded` warning; do not add collections unless the project actually adopts them.
  - If the project ever adopts Astro content collections, use the Content Layer API only: `src/content.config.ts` + `astro/loaders` + `astro/zod`. Do not introduce legacy collections.
  - Do not enable Astro CSP casually. In the current stack it still carries validation friction (`dev` cannot verify it, and Shiki inline styles conflict with it). If you revisit it later, use `security.csp` and remember that analytics needs `https://sight.crystallize.cc` on the script allowlist.
- **Path aliases:** Prefer `#layouts/*`, `#features/*`, `#components/*`, `#images/*`, `#data/*`, `#lib/*`, `#styles/*`, `#config/*`, and `#admin/*` (`#admin/actions` points to the HTTP client action wrappers).
- **Data source:** Commission content lives in `data/commissions.db`; access it through `data/sqlite.ts` (Bun uses `bun:sqlite`, Node falls back to `better-sqlite3`).
  - Admin-managed search configuration tables include `character_aliases`, `creator_aliases`, `keyword_aliases`, and `home_featured_search_keywords`.

## Home Rendering Architecture

- Home page static markup is Astro-first:
  - `src/pages/index.astro`
  - `src/features/home/blocks/*.astro`
  - `src/features/home/HomeClientScript.astro`
  - `src/features/home/server/StaticCommissionSections.astro`
  - `src/features/home/commission/*.astro` (listing/timeline/entry rendering chain)
  - `src/features/home/nav/DesktopSidebarNav.astro` (desktop nav/search/view/locale shell)
  - `src/features/home/nav/hamburger/MobileHamburgerMenu.astro` (mobile hamburger shell)
- Keep React only for interactive islands:
  - `src/features/home/search/CommissionSearchDeferred.tsx` (home search island mounted directly from the Astro page shell)
- Home-level side effects are Astro script components:
  - `src/features/home/warning/AgeGateScript.astro`
  - `src/features/home/HomeClientScript.astro`
  - `src/layouts/AnalyticsScript.astro`
  - `src/features/home/commission/CommissionImageNoticeScript.astro`
  - `src/features/home/dev/DevLiveRefreshScript.astro`
- Astro 6 preserves relative `script` / `style` / `link` order. Treat the current order of home/layout script components as behavior, not formatting, and smoke-test home/admin when reordering them.
- Home runtime side-effect bootstrapping is centralized in:
  - `src/features/home/homePageClient.ts`
- Home refresh scroll restoration is centralized in:
  - `src/features/home/homeScrollRestore.ts`
  - `src/features/home/homeScrollRestoreAbort.ts`
  - `src/lib/navigation/restoreScrollPosition.ts`
- Home unpublished-interest button state is centralized in:
  - `src/features/home/commission/unpublishedInterestClient.ts`
- Home active character lazy-mount behavior is centralized in:
  - `src/features/home/commission/activeCharactersLoader.ts`
  - `src/features/home/commission/activeCharactersEvent.ts`
- Home stale character lazy-mount behavior is centralized in:
  - `src/features/home/commission/staleCharactersLoader.ts`
  - `src/features/home/commission/staleCharactersEvent.ts`
- Home active/stale batch planning and payload generation are centralized in:
  - `src/features/home/server/homeCharacterBatches.ts`
  - `src/features/home/server/homeCharacterBatchPayload.ts`
  - `src/pages/search/home-character-batches/[locale]/[status]/[batch].json.ts`
- Home active/stale batch manifest parsing, fetching, and DOM rendering are centralized in:
  - `src/features/home/commission/homeCharacterBatchManifest.ts`
  - `src/features/home/commission/homeCharacterBatchClient.ts`
  - `src/features/home/commission/deferredCharacterBatchPrefetch.ts`
  - `src/features/home/commission/homeCharacterBatchPayload.ts`
  - `src/features/home/commission/homeCharacterBatchRender.ts`
- Home timeline lazy-mount behavior is centralized in:
  - `src/features/home/commission/timelineViewLoader.ts`
- Home desktop navigation behavior is centralized in:
  - `src/features/home/nav/sidebarNavEnhancer.ts`
- Home mobile top tabs behavior is centralized in:
  - `src/features/home/commission/mobileViewModeTabs.ts`
- Home mobile language menu behavior is centralized in:
  - `src/features/home/nav/hamburger/mobileLanguageMenu.ts`
- Home mobile hamburger behavior is centralized in:
  - `src/features/home/nav/hamburger/mobileHamburgerMenu.ts`
- Home view-panel DOM visibility sync is centralized in:
  - `src/features/home/commission/commissionViewModeDomSync.ts`
- Home search/view-mode behavior depends on existing `data-*` DOM contracts; preserve attribute names and structure when editing Astro templates.
- Home search UX policy:
  - Keep the search UI itself synchronously rendered and layout-stable on first paint; do not reintroduce shell-to-real-content swaps that cause visible jump, drift, or delayed keyword chips.
  - `dev` search may read DOM metadata, but `build` output cannot rely on `data-search-*` attributes being present; production search must keep `/search/home-search-entries.json` as a valid index source.
  - Prefer optimizing index/data loading behind a stable UI shell over lazy-loading the entire search island. If revisiting async loading, prove identical DOM footprint before and after hydration.
  - Active/stale deferred sections now resolve through an inline manifest plus external batch JSON. Preserve the existing `id` / `data-*` DOM contracts inside batch payloads so sidebar, hamburger, hash navigation, and search stay deterministic.
  - `data-stale-visibility` means the stale group is expanded; `data-stale-loaded` means deferred stale sections are fully mounted. Preserve that distinction when touching search/nav/scroll-restore state.
  - Character/stale section templates must mount with their full entry list intact. Do not reintroduce per-section entry lazy mounts above anchor targets; they break deterministic sidebar/hash navigation.
- Shared pure rendering helpers:
  - `src/features/home/commission/linkDisplay.ts` (link sanitization/priority selection)
  - `src/features/home/commission/templateContentLookup.ts` (recursive template-content id lookup for deferred hash/search flows)
  - `src/lib/images/sourceImageRegistry.ts` (source image lookup by commission fileName)

## Admin Rendering Architecture

- Admin routes are Astro page shells in dev-only entrypoints:
  - `src/devAdmin/pages/adminIndex.astro`
  - `src/devAdmin/pages/adminCreate.astro`
  - `src/devAdmin/pages/adminEdit.astro`
  - `src/devAdmin/pages/adminAliases.astro`
  - `src/devAdmin/pages/adminSuggestion.astro`
- Static page structure (title/description/navigation/fallback) stays in Astro templates.
- Admin interactive state is isolated to React islands:
  - `src/features/admin/islands/AdminCreateIsland.tsx`
  - `src/features/admin/islands/AdminEditIsland.tsx`
- `/admin/aliases` mounts `src/features/admin/aliases/AliasesDashboard.tsx` directly as its sole React island.
- `/admin/suggestion` mounts `src/features/admin/suggestion/SuggestionDashboard.tsx` directly as its sole React island.
- Feature-heavy admin UI remains React:
  - `src/features/admin/AddCharacterForm.tsx`
  - `src/features/admin/AddCommissionForm.tsx`
  - `src/features/admin/CommissionManager.tsx`
  - `src/features/admin/aliases/AliasesDashboard.tsx`
  - `src/features/admin/suggestion/SuggestionDashboard.tsx`
  - form/dnd/search subcomponents in `src/features/admin/*`
- Shared not-found presentation is Astro-first:
  - `src/components/shared/NotFoundPage.astro`

## Dev/Admin Responsibilities (must follow)

- `src/admin` is a **development-only data maintenance UI** served at `/admin`.
- In production behavior, `/admin` should not expose editing and must return 404 via route guards + static redirect rules.
- All write operations (`create*`, `update*`, `deleteCommission`, `save*`) are valid only when `NODE_ENV=development`.
- Always import actions from `#admin/actions` so components stay on the HTTP API wrapper path.
- Any admin edit that changes content must include the related `data/commissions.db` update in the same commit.

## Build Timing & Validation Gates

Run checks in this order before pushing:

1. `bun dev` — smoke-check local startup and key page routing (including `/admin` in development).
2. `bun run lint` — run ESLint with auto-fix (`eslint --fix`) and resolve any remaining issues.
3. `bun run check` — run Astro type-check diagnostics for `.astro`/TypeScript integration.
4. `bun run test` — run unit/component tests (Vitest).
5. `bun run test:visual` — run Playwright visual regression when changing layout, iconography, spacing, floating menus, or admin/home shells.
6. `bun run build` — required for commits that change runtime behavior, data access, routes, configs, or component logic.

Additional guidance:

- For docs-only edits, `bun run lint` is still recommended; `bun run build` can be skipped only when no runtime-related files changed.
- If `data/commissions.db`, `server/adminApi.ts`, or admin/data-access code changed, `bun run build` is mandatory.
- If `.astro` files or Astro script blocks are modified, `bun run check` is mandatory.
- Run `bun run test` whenever you modify:
  - `src/admin/*`, `#admin/actions`, `server/adminApi.ts`, `src/lib/admin/db.ts`, `astro.config.ts`
  - Rendering/component logic in `src/components/*` and `src/pages/*`
  - Search/filter/date parsing logic or other user-visible behavior in `src/lib/*` and `data/*`
- Run `bun run test:visual` whenever you modify:
  - `src/features/home/search/*`
  - `src/features/home/nav/*`
  - `src/features/home/nav/hamburger/*`
  - `src/features/admin/suggestion/*`
  - icon sizing/placement in shared UI primitives such as `src/components/ui/*`

## Server Runtime Architecture

- Astro dev integration and route injection:
  - `server/devAdminAstro.ts`
- Standalone dev admin API server:
  - `server/adminApi.ts`
- API route handler:
  - `server/adminApiHandler.ts`
- Shared Node/Web bridge helpers:
  - `server/httpBridge.ts`
- Shared Astro/Vite config typing helper:
  - `server/astroVitePluginType.ts`
- Asset pipeline integration:
  - `server/assetsPipelineAstro.ts`
  - `server/assetsSyncCli.ts`

## Change Log

- Removed the thin `HomeControlsIsland`, `AdminSuggestionIsland`, and `AliasesDashboardIsland` wrappers so home/admin Astro entrypoints mount their actual React islands directly.
- Upgraded timeline mode to year-batched lazy loading with manifest-driven target resolution, preserving always-enabled year nav link styling while loading dots/sections progressively (`src/features/home/server/homeTimelineBatches.ts`, `src/features/home/commission/timelineViewEvent.ts`, `src/features/home/commission/timelineViewLoader.ts`, `src/features/home/server/StaticCommissionSections.astro`).
- Consolidated deferred active/stale target prefetching into `src/features/home/commission/deferredCharacterBatchPrefetch.ts`, reused by sidebar + hamburger nav to remove duplicate batch-target logic.
- Consolidated window scroll restoration behavior into `src/lib/navigation/restoreScrollPosition.ts` and reused it across stale loader + home reload restore.
- Added search-side request de-dup guards so active/stale `strategy: 'all'` load requests are dispatched once per matching query state instead of repeating on every render.
- Split admin maintenance workflow into dedicated `/admin/create` and `/admin/edit` routes, converted `/admin` into an overview dashboard, and reordered section nav so overview is first.
- Aligned the project with Astro 6 defaults by making `redirectToDefaultLocale` explicit, removing Vite plugin type annotations that conflict with Astro's config typing, and documenting CSP guardrails instead of enabling an unstable path in the current stack.
- Added an empty `src/content.config.ts` so Astro dev no longer warns when the project does not use content collections.
- Removed the React-only home locale context/provider and now pass locale into the search island via plain props.
- Simplified home/admin search view-mode wiring to a direct URL/event subscription hook and removed the unused deferred panel provider path.
- Restored unpublished `Want this` button client behavior with localStorage-backed disable/hydration flow after the Astro migration regression.
- Removed unused React hamburger leftovers (`src/features/home/nav/Hamburger.tsx`, `src/features/home/nav/hamburger/MenuContent.tsx`, `src/features/home/nav/hamburger/CharacterMenuList.tsx`, `src/features/home/nav/hamburger/Icons.tsx`) after the Astro mobile menu migration.
- Removed the deferred SearchShell handoff so home/admin search now render the real `CommissionSearch` immediately and only defer index construction.
- Switched admin/server business filenames to camelCase (`adminApi*`, `devAdminAstro`, `assetsPipelineAstro`, `assetsSyncCli`).
- Moved dev admin Astro routes to `src/devAdmin/pages/*`.
- Migrated effect-only home/layout side effects to Astro script components.
- Migrated age gate warning from React island to Astro script.
- Migrated commission image notice gate/client from React to Astro script + DOM module.
- Migrated sidebar click/hash/search-link enhancer from React effect component to Astro script.
- Migrated desktop sidebar navigation (search/view-mode/locale list) from React to Astro + script module.
- Migrated mobile top view-mode tabs from React to Astro + script module.
- Migrated mobile language floating menu from React popover to Astro `details` + script module.
- Migrated mobile hamburger navigation from React island to Astro + script module.
- Removed unused migration leftovers (`CommissionViewModeDomSync.tsx`, `useDocumentTitle`, `src/lib/index.ts`).
- Added dev-only `/admin/suggestion` page to curate featured home search keywords (select + DnD + manual input).
- Added `home_featured_search_keywords` SQLite config table and home-side featured keyword hydration path.
- Added keyword alias management (`keyword_aliases`) to `/admin/aliases` with shadcn tabs and bootstrap/action API wiring.
- Added character alias management (`character_aliases`) to `/admin/aliases` and unified search-suggestion alias display mapping with source priority (`character > creator > keyword`).
- Added shared server request/response bridge utility and test coverage.
- Added active-character lazy-mount pipeline (`template` + loader script + navigation/search load requests) so the home page no longer renders every active character section up front.
- Added stale character lazy-loading pipeline (`template` + loader script + sidebar/search sync events) to reduce initial DOM size while preserving navigation discoverability.
- Split stale state into `visibility` vs `loaded`, and made manual stale expansion mirror active by mounting the first stale section immediately and deferring the remainder behind a sentinel/full-load request path.
- Added a shared home scroll-restore abort event so explicit sidebar/hamburger jumps can cancel pending reload restoration before it overrides the user's navigation.
- Added timeline lazy-mount pipeline (`template` + loader script + search/sidebar sync events) so the hidden timeline view no longer doubles the initial homepage DOM.
- Collapsed most home side-effect entrypoints into `HomeClientScript.astro` + `homePageClient.ts` to reduce initial module requests without changing DOM contracts.
- Added Playwright visual regression baselines for home search/nav shells, mobile floating menus, and the admin featured-keyword dashboard.
- Removed the per-section commission-entry lazy-mount layer so sidebar and update-link anchor jumps stay stable after section templates mount.
- Added home-side reload scroll restoration so lazy-mounted sections can rehydrate before restoring the reader's saved position.
- Replaced embedded active/stale deferred section templates with inline manifest + external batch JSON payloads so the home page can lazy-load section batches more aggressively without sacrificing deterministic sidebar/hash/refresh restore behavior.

## Code Style

- Format code with ESLint auto-fix (`bun run lint`): single quotes, no semicolons, trailing commas, `arrowParens: avoid`, width 100.
- ESLint uses a TypeScript baseline; keep the code free of lint errors.

## Images

- Frontend listing images are rendered with Astro Image (`astro:assets`) from `data/images/*.{jpg,jpeg,png}` source files.
- Source file resolution is centralized in `src/lib/images/sourceImageRegistry.ts`; keep commission `fileName` and source image stem aligned.
- Home listing image widths are fixed at `768/960/1280` and `sizes="(max-width: 768px) 92vw, 640px"` to keep analytics variant labels stable.
- Dev mode includes a source-image watcher (`astro.config.ts`) that full-reloads when `data/images` changes.
- Admin preview image URL uses dev-only API: `GET /api/admin/source-image/:fileName`.
- `/images/webp/*` is no longer a supported runtime contract.

## Commit Etiquette

- Commit only source files; exclude generated or build artifacts such as `dist/`, `.next/`, `out/`, etc.
- Keep each commit focused on one objective.
- For data edits, include both code changes and the matching `data/commissions.db` update in one commit.
- Use this commit message format: `type(scope): short summary`.
- Allowed `type` values: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `build`, `ci`, `revert`, `data`.
- Keep `short summary` in imperative mood, lowercase first letter, and under 72 characters.
- If needed, add a blank line and body bullets describing what changed and why.

## Task Boundaries

- **Allowed:** complete functions, add API handlers, adjust UI components, write or expand tests.
- **Disallowed:** upgrade dependencies, change security policies, alter existing API contracts.

## Interaction Protocol

- Begin responses with a brief plan or reasoning.
- Provide a list of intended changes.
- Conclude with consolidated code blocks.
- Prefer minimal, incremental edits; avoid large refactors.
- Offer multiple options when unsure and explain trade-offs.

## Security & Privacy

- Use environment variables such as `HOSTING` for secrets.
- Do not commit `.env` files or API keys.
- Avoid embedding credentials in code or comments.
