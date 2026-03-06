# AGENTS

This repository contains an Astro 5 static site with React 19 islands, written in TypeScript and managed with Bun.

## Development Notes

- **Runtime & package manager:** Node 22 via [mise](https://mise.jdx.dev) and `bun` for all commands.
- **Framework:** Astro + Tailwind CSS + selective React islands (`@astrojs/react`).
- **Path aliases:** Prefer `#layouts/*`, `#features/*`, `#components/*`, `#images/*`, `#data/*`, `#lib/*`, `#styles/*`, `#config/*`, and `#admin/*` (`#admin/actions` points to the HTTP client action wrappers).
- **Data source:** Commission content lives in `data/commissions.db`; access it through `data/sqlite.ts` (Bun uses `bun:sqlite`, Node falls back to `better-sqlite3`).

## Home Rendering Architecture

- Home page static markup is Astro-first:
  - `src/pages/index.astro`
  - `src/features/home/blocks/*.astro`
  - `src/features/home/server/StaticCommissionSections.astro`
  - `src/features/home/commission/*.astro` (listing/timeline/entry rendering chain)
  - `src/features/home/nav/DesktopSidebarNav.astro` (desktop nav/search/view/locale shell)
- Keep React only for interactive islands:
  - `HomeControlsIsland` (search shell + mobile hamburger)
- Home-level side effects are Astro script components:
  - `src/features/home/warning/AgeGateScript.astro`
  - `src/layouts/AnalyticsScript.astro`
  - `src/features/home/commission/CommissionImageNoticeScript.astro`
  - `src/features/home/commission/CommissionViewModeDomSyncScript.astro`
  - `src/features/home/dev/DevLiveRefreshScript.astro`
  - `src/features/home/nav/SidebarNavEnhancerScript.astro`
- Home desktop navigation behavior is centralized in:
  - `src/features/home/nav/sidebarNavEnhancer.ts`
- Home mobile top tabs behavior is centralized in:
  - `src/features/home/commission/mobileViewModeTabs.ts`
- Home search/view-mode behavior depends on existing `data-*` DOM contracts; preserve attribute names and structure when editing Astro templates.
- Shared pure rendering helpers:
  - `src/features/home/commission/linkDisplay.ts` (link sanitization/priority selection)
  - `src/lib/images/sourceImageRegistry.ts` (source image lookup by commission fileName)

## Admin Rendering Architecture

- Admin routes are Astro page shells in dev-only entrypoints:
  - `src/devAdmin/pages/adminIndex.astro`
  - `src/devAdmin/pages/adminAliases.astro`
- Static page structure (title/description/navigation/fallback) stays in Astro templates.
- Admin interactive state is isolated to React islands:
  - `src/features/admin/islands/AdminDashboardIsland.tsx`
  - `src/features/admin/islands/AliasesDashboardIsland.tsx`
- Feature-heavy admin UI remains React:
  - `src/features/admin/AdminDashboard.tsx`
  - `src/features/admin/aliases/AliasesDashboard.tsx`
  - form/dnd/search subcomponents in `src/features/admin/*`
- Shared not-found presentation is Astro-first:
  - `src/components/shared/NotFoundPage.astro`

## Dev/Admin Responsibilities (must follow)

- `src/admin` is a **development-only data maintenance UI** served at `/admin`.
- In production behavior, `/admin` should not expose editing and must return 404 via route guards + static redirect rules.
- All write operations (`create*`, `update*`, `deleteCommission`) are valid only when `NODE_ENV=development`.
- Always import actions from `#admin/actions` so components stay on the HTTP API wrapper path.
- Any admin edit that changes content must include the related `data/commissions.db` update in the same commit.

## Build Timing & Validation Gates

Run checks in this order before pushing:

1. `bun dev` — smoke-check local startup and key page routing (including `/admin` in development).
2. `bun run lint` — run ESLint with auto-fix (`eslint --fix`) and resolve any remaining issues.
3. `bun run check` — run Astro type-check diagnostics for `.astro`/TypeScript integration.
4. `bun run test` — run unit/component tests (Vitest).
5. `bun run build` — required for commits that change runtime behavior, data access, routes, configs, or component logic.

Additional guidance:

- For docs-only edits, `bun run lint` is still recommended; `bun run build` can be skipped only when no runtime-related files changed.
- If `data/commissions.db`, `server/adminApi.ts`, or admin/data-access code changed, `bun run build` is mandatory.
- If `.astro` files or Astro script blocks are modified, `bun run check` is mandatory.
- Run `bun run test` whenever you modify:
  - `src/admin/*`, `#admin/actions`, `server/adminApi.ts`, `src/lib/admin/db.ts`, `astro.config.ts`
  - Rendering/component logic in `src/components/*` and `src/pages/*`
  - Search/filter/date parsing logic or other user-visible behavior in `src/lib/*` and `data/*`

## Server Runtime Architecture

- Astro dev integration and route injection:
  - `server/devAdminAstro.ts`
- Standalone dev admin API server:
  - `server/adminApi.ts`
- API route handler:
  - `server/adminApiHandler.ts`
- Shared Node/Web bridge helpers:
  - `server/httpBridge.ts`
- Asset pipeline integration:
  - `server/assetsPipelineAstro.ts`
  - `server/assetsSyncCli.ts`

## Change Log

- Switched admin/server business filenames to camelCase (`adminApi*`, `devAdminAstro`, `assetsPipelineAstro`, `assetsSyncCli`).
- Moved dev admin Astro routes to `src/devAdmin/pages/*`.
- Migrated effect-only home/layout side effects to Astro script components.
- Migrated age gate warning from React island to Astro script.
- Migrated commission image notice gate/client from React to Astro script + DOM module.
- Migrated sidebar click/hash/search-link enhancer from React effect component to Astro script.
- Migrated desktop sidebar navigation (search/view-mode/locale list) from React to Astro + script module.
- Migrated mobile top view-mode tabs from React to Astro + script module.
- Removed unused migration leftovers (`CommissionViewModeDomSync.tsx`, `useDocumentTitle`, `src/lib/index.ts`).
- Added shared server request/response bridge utility and test coverage.

## Code Style

- Format code with Prettier: single quotes, no semicolons, trailing commas, `arrowParens: avoid`, width 100.
- ESLint uses a TypeScript + Prettier baseline; keep the code free of lint errors.

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
