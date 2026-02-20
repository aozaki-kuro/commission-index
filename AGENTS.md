# AGENTS

This repository contains a Next.js 15 application written in TypeScript and managed with Bun.

## Development Notes

- **Runtime & package manager:** Node 22 via [mise](https://mise.jdx.dev) and `bun` for all commands.
- **Framework:** Next.js with the `app/` router and Tailwind CSS.
- **Path aliases:** Prefer the `#components`, `#images`, `#commission`, `#data`, `#lib`, and `#admin/*` aliases (`#admin/actions` swaps between dev + stub automatically).
- **Data source:** Commission content lives in `data/commissions.db`; access it through `data/sqlite.ts` (Bun uses `bun:sqlite`, Node falls back to `better-sqlite3`).

## Dev/Admin Responsibilities (must follow)

- `app/(dev)/admin` is a **development-only data maintenance UI** served at `/admin`.
- In production behavior, `/admin` should not expose editing and should fall through to `notFound()`.
- All write operations (`create*`, `update*`, `deleteCommission`) are valid only when `NODE_ENV=development`.
- Always import actions from `#admin/actions` so environment routing (`actions.dev.ts` vs stub) remains intact.
- Any admin edit that changes content must include the related `data/commissions.db` update in the same commit.

## Build Timing & Validation Gates

Run checks in this order before pushing:

1. `bun dev` — smoke-check local startup and key page routing (including `/admin` in development).
2. `bun run lint` — auto-fix and verify formatting/lint.
3. `bun run build` — run for every commit that changes runtime behavior, data access, routes, configs, or component logic.

Additional guidance:
- For docs-only edits, `bun run lint` is still recommended; `bun run build` can be skipped only when no runtime-related files changed.
- If `data/commissions.db` or admin/data-access code changed, `bun run build` is mandatory.

_No automated tests currently. Add and run them when introduced._

## Code Style

- Format code with Prettier: single quotes, no semicolons, trailing commas, `arrowParens: avoid`, width 100.
- ESLint follows Next.js recommendations with Prettier integration; keep the code free of lint errors.

## Images

- To add or update images, run:
  - `bun run scripts/convert.ts`
  - `bun run scripts/imageImport.ts`

## Commit Etiquette

- Commit only source files; exclude generated or build artifacts such as `.next/`, `dist/`, `out/`, etc.
- Keep each commit focused on one objective.

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
