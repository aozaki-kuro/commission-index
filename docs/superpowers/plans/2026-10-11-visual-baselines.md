# Plan: repair visual regression suites (2026-10-11)

Branch `fix/visual-baselines` (from master `ceb1292`). No separate spec: HANDOFF.md "视觉问题" + "下一步" items 1–5
are the requirements; rulings below are the authority (provisional).

## Diagnosis (controller, verified 2026-10-11)

`pnpm exec playwright test -c config/playwright.config.ts --project admin`: 31 failed / 28 passed.
`pnpm run test:admin-ui`: 1 failed / 27 passed. Every failure traces to a commit already on master:

| Failure group                                                                                            | Cause                                                                                                             | Commit    |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 10× `admin-create` 30 s waits for heading `Add Commission Entry`                                         | heading renamed `Entry details`                                                                                   | `10fd8ad` |
| `admin-create` overview test waits for heading `Quick actions`                                           | heading renamed `Manage content`                                                                                  | `d734944` |
| `admin-aliases` waits for heading `Alias mapping`                                                        | page h1 is `Aliases`; first section h2 `Character aliases`                                                        | `d734944` |
| 8× `crop lifecycle edit *` — `undefined.replaceAll` in `formatCommissionPublicId`                        | inline fixture lacks `publicId` (and other identity fields)                                                       | `2939c7e` |
| `ui-stability:690` waits for `Dispatching…`                                                              | floating rebuild pending label is now `Checking…`                                                                 | `89797f2` |
| ~9 `ui-stability` failures only under cross-workspace config                                             | admin project has no `testMatch`, runs specs owned by `apps/admin/playwright.ui.config.ts` at 8 workers/1440×1600 | config    |
| `admin-edit-page`, `admin-edit-manager`, `admin-suggestion-dashboard` screenshot size 672→1152/1232 wide | shell width unification; baselines predate it                                                                     | `10fd8ad` |
| `admin-edit` replacement crop: rotation `-114°` expected `37°`                                           | unknown — Task 3                                                                                                  | ?         |

## Global Constraints

- Never `--update-snapshots` without a `-g '<exact test title>'` and `--project <name>`; never bare `test:visual:update`.
  Baseline updates happen only in Task 4 after the controller has viewed actual/expected/diff PNGs.
- No `admin-*.spec.ts` may let a request reach the live worker that mutates data. After Task 2 no admin spec may reach
  the live worker at all: `page.route('**/api/admin/**')` must answer every request, and unknown paths/methods answer
  404/400 from the fixture.
- Before every Playwright run: `lsof -nP -iTCP:4173 -iTCP:8787 -iTCP:4174 -sTCP:LISTEN`; kill orphans first
  (`reuseExistingServer` silently attaches to stale servers).
- Run Playwright and pnpm verify commands serially. Do not edit source while a browser run is in progress.
- Do not edit `apps/admin/src/**` unless Task 3 proves a product regression.
- Commit per task, `type(scope): description`, no attribution trailers.

## Rulings

- R1: HANDOFF step 2 ("run on a clean master checkout") is satisfied by `git log -S` archaeology — every failing
  selector/label was changed by a commit on master — cost if wrong: one unexplained failure survives (Task 3 is the
  open one).
- R2: Admin screenshot specs (`admin-*.spec.ts`) become fixture-backed like `ui-stability.spec.ts`; the
  cross-workspace config stops starting the remote-bound admin worker and the admin Vite server runs without
  `ADMIN_API_BASE_URL` — why: live D1 rows made admin baselines drift exactly like web's, the edit replacement test
  uploads against real data guarded by one route pattern, and fixture drift (`publicId`) is caught by TypeScript
  only if fixtures share the domain types — cost if wrong: admin visuals stop exercising the live worker contract
  (none of them asserted it); revert is one config hunk.
- R3: Web baseline drift is deferred: a non-empty web fixture needs fixture images + manifest hash/size and flips
  `VISUAL_OFFLINE` from smoke-only to baseline mode (an AGENTS.md rule change). Masking does not work —
  `home-character-sidebar` _is_ the data. Record in `docs/open-issues.md` — cost if wrong: next data change again
  needs a manual 3-PNG refresh.
- R4: Dark-mode and age-gate first-frame visual cases are out of scope (HANDOFF wishlist, not a defect).
- R5: The cross-workspace admin project is single-viewport 1440×1600; "desktop and mobile" eye checks for admin
  apply only to the viewports each spec sets itself.

## Task 1: Restrict cross-workspace admin project to screenshot specs; fix stale rebuild label

Files: `config/playwright.config.ts`, `apps/admin/test/visual/ui-stability.spec.ts`, root `AGENTS.md`.

1. In `adminProject` of `config/playwright.config.ts`, add `testMatch: 'admin-*.spec.ts'` (the complement of
   `testIgnore: 'admin-*.spec.ts'` in `apps/admin/playwright.ui.config.ts`).
2. `ui-stability.spec.ts` line ~690: replace `'Dispatching…'` with `'Checking…'` (the pending label in
   `apps/admin/src/components/FloatingRebuildButton.tsx:14`).
3. Root `AGENTS.md`, Configuration Layout bullet about `apps/admin/playwright.ui.config.ts`: add that the
   cross-workspace admin project matches only `admin-*.spec.ts`, so each spec file has exactly one owning config.

Gates:

- `pnpm exec playwright test -c config/playwright.config.ts --project admin --list` lists only `admin-*.spec.ts`.
- `pnpm run test:admin-ui` → 28 passed, 0 failed.
- `pnpm run lint` clean.

## Task 2: Fixture-back the admin screenshot specs and update stale selectors

Files: `apps/admin/test/visual/helpers.ts`, `admin-create.spec.ts`, `admin-aliases.spec.ts`, `admin-edit.spec.ts`,
`admin-suggestion.spec.ts`, `config/playwright.config.ts`, root `AGENTS.md`, `apps/admin/test/AGENTS.md` if a rule
is added.

1. Selector updates (exact strings):
   - `admin-create.spec.ts`: every `{ name: 'Add Commission Entry' }` → `{ name: 'Entry details' }`.
   - `admin-create.spec.ts`: `{ name: 'Quick actions' }` → `{ name: 'Manage content' }`.
   - `admin-aliases.spec.ts`: wait for `getByRole('heading', { level: 1, name: 'Aliases' })`; in the screenshot union
     replace the `Alias mapping` heading locator with `getByRole('heading', { name: 'Character aliases' })`.
     Keep the other union locators unless they no longer resolve; if so, pick the nearest equivalent and say why.
2. Add a shared fixture router to `helpers.ts`, e.g. `export async function mockAdminApi(page, overrides?)`, that
   answers every `**/api/admin/**` request deterministically: `health`, `bootstrap`
   (`characters`, `commissionSearchRows`, `creatorAliases`), `characters/:id/commissions`, `aliases/bootstrap`,
   `suggestion` GET, `commissions/:id/source-image` GET (SVG 1280×525) and POST (success JSON, exposing the captured
   body/content-type for the edit test), any other non-GET → 400 JSON, any other GET → 404 JSON. Type the fixture rows
   with the domain/admin types the app consumes (e.g. `AdminCommissionSearchRow` from `@commission-index/domain` or
   the admin's own types) so a future required field breaks `typecheck`, not the browser. Use
   `ui-stability.spec.ts:7-22` as the row-shape reference (`publicId`, `commissionDate`, `creatorName`,
   `workGroupId`, `partNumber`, `design`, `description`, `keyword`, `links`, `hidden`). Fixture content should be
   small but realistic: at least 2 characters (one with ≥2 commissions), creator aliases, 3+ featured keywords.
   Do not refactor `ui-stability.spec.ts`'s own `mockApi` (out of scope).
3. Every test in `admin-create.spec.ts`, `admin-aliases.spec.ts`, `admin-edit.spec.ts`, `admin-suggestion.spec.ts`
   calls the router before `page.goto`. The `crop lifecycle` tests' inline fixture is replaced by (or rebuilt on) the
   shared router so the edit variant has a full row with `publicId`.
4. `config/playwright.config.ts`: remove the admin-worker `webServer` entry and the `ADMIN_API_BASE_URL=…` prefix on
   the admin Vite command; update the comment above it. Root `AGENTS.md` Configuration Layout: replace "The default
   cross-workspace visual run still starts the remote-bound admin worker" with the new fact (admin visuals are
   fixture-backed; only the web server reads remote data).

Acceptance (this task is NOT "all green"):

- Admin run: zero 30 s timeouts, zero `replaceAll` / `Admin route failed to render` in output, and no request reaches
  port 8787 (nothing listens there).
- Remaining failures may only be `toHaveScreenshot` mismatches and the `admin-edit` rotation assertion (Task 3).
  Report each remaining failure with its message. Do NOT update any baseline.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:admin-ui` (28/28) pass.

## Task 3: Diagnose the replacement-crop rotation mismatch

`admin-edit.spec.ts:12` "replacement source image is cropped before upload": `getByLabel('Image rotation')` shows
`-114°`, test expects `37°`, after `rotateCropImage(page, …)` (`helpers.ts`). Root-cause it (systematic debugging):
compare with the create-page rotation tests (`admin-create.spec.ts` "source image cropper exports the fixed JPEG
contract", "supports touch transform gestures") which use the same helper and become reachable after Task 2.
Determine whether the helper's handle/center geometry is stale relative to the current crop dialog layout, or whether
the cropper rotation (`apps/admin/src/components/image/ImageCropWorkspace.tsx`, `src/lib/imageCrop.ts`) regressed.
Fix the root cause: test helper if the test is stale; product code (with a Vitest unit test where the logic is pure)
if the product regressed. Do not change the expected angle to match observed output without explaining the geometry.

Gates: the three rotation-using admin tests pass their rotation assertions; `pnpm run test:admin-ui` 28/28;
`pnpm run typecheck`, `pnpm run lint`, `pnpm run test` (if product code changed).

## Task 4: Regenerate admin baselines (controller-adjudicated)

Controller runs `--project admin`, views each failing actual/expected/diff PNG, and approves a list of exact test
titles whose differences are explained by Tasks 2–3 and the shell-width change. An implementer then runs, per approved
title, `pnpm exec playwright test -c config/playwright.config.ts --project admin -g '<title>' --update-snapshots`,
then a full `--project admin` run (must be fully green) and a full `pnpm run test:visual` (web 11/11 must remain green
and no web PNG may change). `git status` must show only the approved PNGs.

## Task 5: Docs close-out

`docs/open-issues.md`: add the verified root cause of the admin visual failures under the 收口 list (one line), add the
R3 web-drift deferral under Verification gaps, keep every other item. `HANDOFF.md`: mark the admin visual section
resolved with a pointer to this branch's commits. No other doc changes.

## Execution rulings (from the SDD ledger, 2026-10-11)

- T1: `ui-stability` "Website rebuild queued." is stale since `89797f2`; the fixture returns `dispatchedAt`, routes
  `**/build-info.json` with `dataExportedAt >= dispatchedAt`, and asserts "Website updated and confirmed live." — cost
  if wrong: only the success path is browser-covered; the unconfirmed path stays unit-test-only.
- T2: the auto-written `admin-create-character-dialog-darwin.png` was carried to the Task 4 eye check (approved there),
  not deleted.
- T2: `apps/admin/tsconfig.json` now includes `test/**/*.ts`, so fixture drift fails `pnpm run typecheck` — cost if
  wrong: slightly longer tsc.
- T4: the 7 admin baselines were approved after adding data-ready waits (edit/suggestion specs could otherwise settle on
  a loading state).
- T4b: the narrow-screen crop flake was a product nondeterminism (first measurement 588 px, then ResizeObserver migrated
  to 576 px, ~2% smaller opening fit). Fixed in `ImageCropWorkspace` (`userEditedRef`: re-fit until the first user edit,
  proportional migration after); the test-side Reset workaround was removed — narrow test 40/40.
- T5: the docs-only task review was folded into the final whole-branch review; the 6-line final fix wave was
  re-reviewed inline by the controller.
