# Plan: follow-ups after the visual baseline repair (2026-10-11)

Source: the "remaining work" review after PR #384 (`fix/visual-baselines`). Owner delegated execution ("交给你了"),
including PR + merge to master. No separate spec: `docs/open-issues.md` entries and the rulings below are the authority
(provisional). Each task is its own branch off the latest `origin/master` and its own PR, so every production deploy is
one reversible change.

## Global Constraints

- Branch per task from up-to-date `origin/master`; one PR per task; merge style matches the repo (rebase merge,
  linear history).
- Commit messages `type(scope): description`, lowercase, < 72 chars, no attribution trailers.
- Run pnpm verify commands serially (`lint`, `typecheck`, `test`, `test:admin-ui`); never in parallel.
- Before any Playwright run: `lsof -nP -iTCP:4173 -iTCP:8787 -iTCP:4174 -sTCP:LISTEN`; stop orphans first.
- `.github/**` edits follow `.github/AGENTS.md`; update its pipeline list in the same change.
- Same-change doc rule (root `AGENTS.md` Maintenance rule): update the closest `AGENTS.md` / `docs/open-issues.md`
  when a behaviour, gate, or backlog item changes.
- Do not run remote D1/R2 commands, `rebuild`, or `apps/admin-worker/scripts/listR2Orphans.ts`.

## Rulings

- F1: `test:admin-ui` goes into the PR `build` job (fixture-only, no secrets, screenshot-free — only `admin-*.spec.ts`
  call `toHaveScreenshot`). `test:visual` stays local: its web project needs remote D1/R2 and its baselines are
  darwin-only — cost if wrong: admin screenshot specs can still rot unnoticed until R3 lands.
- F2: Playwright browsers are installed per run without caching (`pnpm exec playwright install --with-deps chromium`);
  a cache key would need its own namespace under `.github/AGENTS.md` rules for ~30 s saved — cost if wrong: ~30–60 s
  per CI run.
- F3: LOGIC-02 narrows only commission-scoped saves. The broadcast gains an optional `characterIds` list; a message
  without it (alias, character, create, keyword-batch, and any message from an older tab during a deploy) keeps the
  current "refetch every loaded character" behaviour — cost if wrong: some cross-tab refreshes stay broad.
- F4: R3 (deterministic web fixture) is not in this plan; it gets its own plan after an advisor design pass.

## Task 1: Run `test:admin-ui` in CI and add the pre-merge gate rule

Files: `.github/workflows/ci.yml`, `.github/AGENTS.md`, root `AGENTS.md` (Validation Gates), `HANDOFF.md` /
`docs/open-issues.md` only if they claim CI runs no Playwright.

1. In `ci.yml` job `build`, after `Unit tests` and before `Prepare offline Astro fixture`, add two steps:
   - `Install Playwright Chromium`: `pnpm exec playwright install --with-deps chromium`
   - `Admin UI tests (API fixtures)`: `pnpm run test:admin-ui`
     Keep the existing step comment style (Chinese comments in this file are fine). `apps/admin/playwright.ui.config.ts`
     already sets `reuseExistingServer: !process.env.CI`, so CI always starts its own Vite server.
2. `.github/AGENTS.md` "CI（PR 校验；master 发布）" item 1: add the admin UI Playwright run (fixture-backed, no
   production data or credentials).
3. Root `AGENTS.md` Validation Gates: add a short rule — a change under `apps/admin/src/**` or `apps/admin/test/**`
   must pass `pnpm run test:admin-ui` (CI-enforced) and `pnpm exec playwright test -c config/playwright.config.ts
--project admin` (local only; darwin baselines) before merge.
4. Locally: `pnpm run lint`, then `CI=1 pnpm run test:admin-ui` (28 passed).

Acceptance: the PR's `Validate & Build` check runs the admin UI step and it passes on ubuntu. If a test fails only on
Linux (font metrics, text-zoom/overflow checks), root-cause it — do not skip or loosen the assertion without a
recorded reason.

## Task 2: Replace web alias-logic copies with `@commission-index/domain`

Files: `apps/web/src/lib/{characterAliases,creatorAliases,keywordAliases}.ts` (delete), every web importer of
`@lib/characterAliases`, `@lib/creatorAliases`, `@lib/keywordAliases` (switch to `@commission-index/domain`), any web
test that imports them, `docs/open-issues.md` (remove the "web 内残留别名逻辑副本" item, add a 收口 line).

1. Before deleting, diff each web file against `packages/domain/src/<same name>.ts` ignoring comments; confirm every
   exported symbol used by web exists in `packages/domain/src/index.ts` with the same signature. If any behaviour
   differs, stop and report (BLOCKED) instead of choosing.
2. Switch imports, delete the three copies, and remove a web unit test only if it duplicates a domain test of the same
   function (otherwise retarget it at the domain import).
3. `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and `pnpm -C apps/web exec astro check .` (offline; uses the
   existing `apps/web/generated/`).

## Task 3: LOGIC-02 — refetch only affected characters on cross-tab updates

Files: `apps/admin/src/lib/dataUpdateSignal.ts`, its callers that save a single commission/character's commissions
(`CommissionEditForm.tsx`, `CommissionManager.tsx`, `hooks/useCommissionManager.ts` — read each call site to decide),
the cross-tab subscriber in `apps/admin/src/components/edit/CommissionManager.tsx`, `apps/admin/AGENTS.md` (Edit Page
section, one line), `docs/open-issues.md` (close LOGIC-02 residue).

1. `notifyDataUpdate(scope?: { characterIds: number[] })` — the BroadcastChannel message carries `characterIds` when
   given. The storage-ping fallback stays scope-less (full refresh).
2. `subscribeToDataUpdates` passes the scope (or `undefined`) to its callback.
3. The Edit page subscriber: with a scope, refetch only loaded characters in `characterIds` (plus bootstrap, as today);
   without a scope, keep the current full behaviour. Preserve every Edit Page rule in `apps/admin/AGENTS.md`
   (in-flight reorder protection, stale-read guards, query/expansion/focus preservation).
4. Only call sites that know the exact affected character IDs pass a scope (e.g. a commission edit that moves a work
   between characters must include both). Everything else stays scope-less.
5. Unit tests (Vitest, jsdom where needed): signal round-trip with and without scope (ignoring own tab), and the
   subscriber refetching only the scoped characters. Use `vi.waitFor`, not fixed Promise loops.
6. `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run test:admin-ui`.
