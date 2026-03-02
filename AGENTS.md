# AGENTS

This repository contains a Vite + React 19 application written in TypeScript and managed with Bun.

## Development Notes

- **Runtime & package manager:** Node 22 via [mise](https://mise.jdx.dev) and `bun` for all commands.
- **Framework:** Vite + React Router + Tailwind CSS.
- **Path aliases:** Prefer the `#app`, `#components`, `#images`, `#commission`, `#data`, `#lib`, and `#admin/*` aliases (`#admin/actions` points to the HTTP client action wrappers).
- **Data source:** Commission content lives in `data/commissions.db`; access it through `data/sqlite.ts` (Bun uses `bun:sqlite`, Node falls back to `better-sqlite3`).

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
3. `bun run test` — run unit/component tests (Vitest).
4. `bun run build` — required for commits that change runtime behavior, data access, routes, configs, or component logic.

Additional guidance:

- For docs-only edits, `bun run lint` is still recommended; `bun run build` can be skipped only when no runtime-related files changed.
- If `data/commissions.db`, `server/admin-api.ts`, or admin/data-access code changed, `bun run build` is mandatory.
- Run `bun run test` whenever you modify:
  - `src/admin/*`, `#admin/actions`, `server/admin-api.ts`, `src/lib/admin/db.ts`, `vite.config.ts`
  - Rendering/component logic in `src/components/*` and `src/pages/*`
  - Search/filter/date parsing logic or other user-visible behavior in `src/lib/*` and `data/*`

## Code Style

- Format code with Prettier: single quotes, no semicolons, trailing commas, `arrowParens: avoid`, width 100.
- ESLint uses a TypeScript + Prettier baseline; keep the code free of lint errors.

## Images

- To add or update images, run:
  - `bun run scripts/images.ts`
- To clean stale webp files:
  - `bun run images:prune-unused`
- Keep static export image variants at:
  - Base: `<name>.webp`
  - Responsive: `<name>-960.webp`, `<name>-1280.webp`
- `-640.webp` is intentionally not generated.
- Listing image rendering should use `srcset` (`960w`, `1280w`) with:
  - `sizes="(max-width: 768px) 92vw, 640px"`
- When evaluating whether to add a sub-960 variant, use `commission_image_variant_loaded` distribution first.

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
