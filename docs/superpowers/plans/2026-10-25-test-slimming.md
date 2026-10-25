# Test Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove test bloat that violates the repo's own test rules (SQL-string D1 fakes, hand-written mock
cleanup, always-on debug screenshots) without losing behavioral coverage.

**Architecture:** Three independent tasks with disjoint file sets, each on its own branch from `origin/master` and
its own PR. Admin worker API tests move onto the real in-memory SQLite D1 (`apps/admin-worker/test/sqliteD1.ts`);
Vitest restores spies/globals/envs by config; Playwright specs stop writing debug artifacts on passing runs.

**Tech Stack:** Vitest 5.0.3 (root `config/vitest.config.ts`), `node:sqlite` `DatabaseSync`, Playwright 1.63.

**Spec:** owner request 2026-10-25 ("评估现有测试是否过于复杂…都改了吧，并发大一些") plus the evaluation in that
session. Evidence and rulings below stand in for a separate spec.

## Evidence (2026-10-25, `origin/master` + this checkout)

- `pnpm run test`: 552 tests, 3.8 s wall. Runtime is not the problem; maintenance and fidelity are.
- `apps/admin-worker/src/adminApi.test.ts` (1667 lines): 24 tests use `createD1Recorder`, which answers queries by
  `query.includes(...)` (35 branches). `apps/admin-worker/src/test/adminReadD1Fixture.ts` (178 lines) does the same
  for read routes. Root `AGENTS.md` forbids this ("不要用 SQL 字符串匹配再实现一套数据库"); `apps/admin-worker/AGENTS.md`
  says "Assert stored results and rollback invariants, not SQL text". `createSQLiteD1` is never used by this file.
- Mock-backend tests ("normalizes X before delegating to backend") duplicate native tests ("handles X natively when DB
  binding exists"). The `backend` parameter of `handleAdminApiRequest` is only passed by tests
  (`src/index.ts:93` calls it with `(request, env)`).
- 45 manual `vi.restoreAllMocks` / `vi.unstubAllGlobals` / `vi.unstubAllEnvs` / `vi.useRealTimers` calls in 29 test
  files; `config/vitest.config.ts` sets none of `restoreMocks` / `unstubGlobals` / `unstubEnvs`. Calls placed at the
  end of a test body are skipped when an assertion fails, leaking spies into later tests.
- `apps/admin/test/visual/ui-stability.spec.ts` writes 20 `testInfo.outputPath(...)` artifacts (fullPage
  screenshots, some at DPR 2 / 2560 px, JSON dumps) on every passing run; `aliases-ui.spec.ts` writes 1.

## Rulings

- **Ruling: drop the "extract a shared loader core" item.** `docs/superpowers/plans/2026-10-25-web-static-listing.md`
  (branch `docs/web-static-listing-plan`) deletes `commission/loader/`, `commission/batch/` and the deferred branches
  in search/nav/scroll restore. Refactoring them now is wasted work and a guaranteed merge conflict. Cost if wrong:
  ~1.7k lines of duplicated loader tests survive until that plan lands.
- **Ruling: no task touches `apps/web/src/features/home/**` or `apps/web/test/visual/home-navigation.spec.ts`.** Same
  reason; those files are rewritten or deleted by the static listing plan. Global Vitest config still applies to them.
- **Ruling: three branches, three PRs, run in parallel.** File sets are disjoint (see Preflight in the SDD ledger);
  each task runs in its own worktree. Only Task 2 starts Playwright servers (4173/4174), so no port collision.
- **Ruling: mock-backend tests stay only where they assert something the SQLite path cannot express more directly**:
  validation rejections that must not reach persistence, and route-level behavior (unknown route 404, removed
  endpoint 404, rebuild dispatch). A rejection test may instead use SQLite and assert row counts are unchanged.
- **Ruling: read-route expected payloads are the contract.** When real SQL yields a different payload than the old
  hand-fed rows, change the expectation only if the old fixture row was impossible under the real schema/migrations;
  list every such change in the task report. Anything else is a production finding: report it, do not fix it.
- **Ruling: no production code changes in any task.** A test that exposes a production bug is reported as
  DONE_WITH_CONCERNS.

## Global Constraints

- Branch from `origin/master`; never commit to `master`. Commit format `type(scope): summary` (lowercase, < 72 chars),
  no attribution trailers.
- Run pnpm commands sequentially inside one checkout (install/lint/typecheck/test/build race on `node_modules`).
- Tests assert behavior: no source-string or SQL-text assertions; async DOM waits use `vi.waitFor`.
- R2 stays mocked at the boundary (`createImagesBucketRecorder` style); D1 uses `createSQLiteD1`.
- Never run `playwright test --update-snapshots`; never modify files under `test/visual/**/*-snapshots/`.
- Do not touch `apps/web/src/features/home/**`, `apps/web/test/visual/home-navigation.spec.ts`, or production source,
  except the single spy-scope move (module scope / `beforeAll` → `beforeEach`) that Task 3 Step 2 names.
- Every task ends green on: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` (and Task 2: its Playwright gates).

## Review Focus

1. A read-route assertion rewritten to match SQLite output instead of the contract (silent behavior change).
2. A deleted mock-backend test whose normalization (trim, null coercion, ordering arrays, links split) is no longer
   asserted anywhere → coverage loss.
3. `restoreMocks` runs **before each test**: a spy created at module top level or in `beforeAll` silently reverts for
   every test after the first.
4. A removed Playwright artifact that an assertion or a later step actually reads.
5. Failure-path tests (insert conflict, batch failure, R2 cleanup failure) losing their failure injection when moved
   to SQLite, so they pass without exercising the failure.

---

### Task 1: Move admin API tests onto SQLite D1

**Files:**

- Modify: `apps/admin-worker/src/adminApi.test.ts`
- Create: `apps/admin-worker/test/adminReadSeed.ts`
- Delete: `apps/admin-worker/src/test/adminReadD1Fixture.ts` (and `src/test/` if then empty)

**Interfaces:**

- Consumes: `createSQLiteD1({ failAtBatchStatement? }) → { database: DatabaseSync, db, batchCallCount() }` from
  `apps/admin-worker/test/sqliteD1.ts` (unchanged).
- Produces: `seedAdminReadFixture(database: DatabaseSync): void` in `apps/admin-worker/test/adminReadSeed.ts`, inserting
  the characters / commissions / source_images / alias / suggestion rows the read-route tests need, via SQL `INSERT`.

- [ ] **Step 1: Record the baseline.** `pnpm exec vitest run -c config/vitest.config.ts apps/admin-worker` → note the
      test count; `wc -l` both files.
- [ ] **Step 2: Rewrite native write tests** (create/update/delete/order character, create/update/delete commission,
      source-image replace, suggestion and alias writes, R2 batch delete, R2 cleanup failure, missing IMAGES 503) to seed
      rows with `database.exec`/`prepare().run`, call `handleAdminApiRequest(request, env)`, then assert the response
      envelope **and** the stored rows via `database.prepare(...).get/all`. Insert-conflict and batch-failure tests use a
      real constraint violation or `failAtBatchStatement`, and assert the pre-existing rows are intact.
- [ ] **Step 3: Rewrite read tests** (bootstrap, aliases bootstrap, suggestion, character commissions, source image by
      id, `If-None-Match`, both 404 cases) on `seedAdminReadFixture`; keep the existing expected payloads (Ruling above).
- [ ] **Step 4: Remove duplicates.** Delete each "normalizes … before delegating to backend" test after confirming its
      normalization is asserted by a native test; move any uncovered assertion into the native test first. Keep the
      validation-rejection and route-level tests (Ruling above).
- [ ] **Step 5: Delete `createD1Recorder`, `StatementExecution`, the old fixture file.** Check:
      `git grep -n "query.includes\|createD1Recorder\|adminReadD1Fixture" apps/admin-worker` → no output.
- [ ] **Step 6: Verify.** `pnpm exec vitest run -c config/vitest.config.ts apps/admin-worker` passes; then
      `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`. Report before/after line counts and test counts, plus a
      table mapping every deleted test to the test that now covers it.
- [ ] **Step 7: Commit** `test(admin-worker): run api tests against sqlite d1`.

### Task 2: Stop writing Playwright debug artifacts on passing runs

**Files:**

- Modify: `apps/admin/test/visual/ui-stability.spec.ts`, `apps/admin/test/visual/aliases-ui.spec.ts`
- Modify: `apps/admin/playwright.ui.config.ts` (`use.screenshot: 'only-on-failure'`)

**Interfaces:** none shared.

- [ ] **Step 1: Baseline timing.** `pnpm run test:admin-ui` → record pass count and wall time.
- [ ] **Step 2: Remove artifact writes no assertion reads**: `page.screenshot({ path: testInfo.outputPath(...) })`,
      `writeFile(testInfo.outputPath(...))`, and `testInfo.attach(...)` of geometry dumps. Keep every `expect`. Keep an
      artifact only if something reads it back; say which in the report. Drop imports and `testInfo` params left unused.
- [ ] **Step 3: Set `screenshot: 'only-on-failure'`** in `apps/admin/playwright.ui.config.ts` `use` so failures still
      leave evidence.
- [ ] **Step 4: Verify.** `pnpm run test:admin-ui` passes with the same count; record wall time. Then
      `pnpm run lint`, `pnpm run typecheck`.
- [ ] **Step 5: Commit** `test(admin): drop debug artifacts from passing ui runs`.

### Task 3: Let Vitest restore mocks, globals and envs

**Files:**

- Modify: `config/vitest.config.ts` (`test.restoreMocks: true`, `test.unstubGlobals: true`, `test.unstubEnvs: true`)
- Modify: test files with now-redundant cleanup, **excluding** `apps/web/src/features/home/**` and
  `apps/admin-worker/src/adminApi.test.ts` (Task 1). Current list: `apps/admin-worker/src/adminCommissionFutureDate.test.ts`,
  `apps/admin-worker/src/exportWebFactSource.test.ts`, `apps/admin/src/**` (8 files from
  `git grep -l "vi.restoreAllMocks\|vi.unstubAllGlobals\|vi.unstubAllEnvs" -- 'apps/admin/src'`),
  `apps/web/data/commissionRecords.test.ts`, `apps/web/data/generatedFactSource.test.ts`,
  `apps/web/src/lib/navigation/jumpToCommissionSearch.test.ts`
- Modify: root `AGENTS.md` → "Unit Test Scope"

**Interfaces:** none shared. Semantics (Vitest 5.0.3 docs): each option calls `vi.restoreAllMocks()` /
`vi.unstubAllGlobals()` / `vi.unstubAllEnvs()` **before each test**; `restoreMocks` restores only `vi.spyOn` spies.

- [ ] **Step 1: Enable the three options** in `config/vitest.config.ts`.
- [ ] **Step 2: Find scope hazards.** `git grep -n "spyOn\|stubGlobal\|stubEnv"` in every test file (all workspaces,
      including the excluded ones — they still run under the config): a spy/stub created at module scope or in
      `beforeAll` that later tests rely on must move into `beforeEach`. In excluded files, make only that move, nothing
      else. Confirm `git grep -n "\.concurrent"` in tests is empty.
- [ ] **Step 3: Remove redundant cleanup** in the in-scope files: `vi.restoreAllMocks()`, `vi.unstubAllGlobals()`,
      `vi.unstubAllEnvs()` calls, and `afterEach` blocks left empty. Keep `vi.useRealTimers()`, `removeEventListener`,
      DOM resets and manual `globalThis.x = original` restores (not covered by the config).
- [ ] **Step 4: Document.** In root `AGENTS.md` "Unit Test Scope", add one bullet (in Chinese, matching the section): the root config restores
      `vi.spyOn` spies, `vi.stubGlobal` and `vi.stubEnv` before each test, so tests do not hand-write those restores, and
      spies shared across tests are created in `beforeEach`, never at module scope or in `beforeAll`.
- [ ] **Step 5: Verify.** `pnpm run test` (552 tests, all pass), `pnpm run lint`, `pnpm run typecheck`. Report the
      count of removed calls and every file where a spy moved into `beforeEach`.
- [ ] **Step 6: Commit** `test: restore mocks and stubs via vitest config`.
