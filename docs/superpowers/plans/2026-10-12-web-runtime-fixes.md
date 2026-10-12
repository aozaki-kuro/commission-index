# Web Runtime Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five public-site runtime defects:

- soft-nav locale switches load the wrong locale's batches;
- a mid-sequence batch failure double-mounts on retry;
- a prefetch skips the stale-HTML fallback;
- a hung batch fetch freezes all loading;
- one bad deferred mount, or blocked `localStorage`, kills the page runtime.

**Architecture:** Each fix is local to the module that owns the state. Manifest caches are keyed by the manifest `<script>` element, so a ClientRouter swap invalidates them. Loaders persist their loaded-batch count in `finally`. Prefetch and fetch share one retry-wrapped loader. Batch fetches carry an `AbortSignal.timeout`. Deferred mounts are isolated from each other, and storage access is guarded.

**Tech Stack:** Astro 7 ClientRouter, vanilla TS, Vitest (jsdom per file), Playwright `web` project.

**Spec:** `docs/audit-2026-10-12-full-repo.md` §1: WEB-1, WEB-2, WEB-3, WEB-6, WEB-4.

## Global Constraints

- Read `apps/web/AGENTS.md` and `apps/web/src/features/home/search/AGENTS.md` before touching loaders. They define the deferred-loading contract, the DOM/dataset names and the soft-nav lifecycle.
- Keep `mountLegacyHome*Batch` (the production fallback) and every `clear*ForTests` export. Both are listed as "verified not a defect" in `docs/open-issues.md`.
- Async DOM tests wait with `vi.waitFor`, never with fixed promise/timer loops (`AGENTS.md` Unit Test Scope).
- Run pnpm gates sequentially, never in parallel.
- Batch fetch timeout: `BATCH_FETCH_TIMEOUT_MS = 15_000`, applied only where `AbortSignal.timeout` exists.

## Review Focus

- Soft-nav from `/` to `/ja/` and back. The second visit to `/` must read the en manifest again, not a cached ja one. Task 1 tests both directions.
- Timeline: after a mid-sequence failure, the count is persisted too. Task 2 covers all three loaders, not just active.
- A 404 on prefetch where the fresh manifest has the same version must still reject, and the user-facing failure UI must still appear. Task 3 pins this.
- An aborted fetch (timeout) must hit the same failure path as an HTTP error, which is `ACTIVE_CHARACTERS_LOAD_FAILED_EVENT` for active. Task 4 pins it.
- Age gate with storage blocked keeps the documented behavior from the inline head script (`pages/HomePage.astro:157-171`): the gate does not open and nothing throws. Task 5 pins it.

---

### Task 1: Manifest caches survive only as long as their `<script>` element (WEB-1)

**Files:**

- Modify: `apps/web/src/features/home/commission/batch/homeCharacterBatchManifest.ts:10-40`
- Modify: `apps/web/src/features/home/commission/batch/homeTimelineBatchManifest.ts:7-48`
- Test: `apps/web/src/features/home/commission/batch/homeCharacterBatchClient.test.ts` and `homeTimelineBatchClient.test.ts` (extend; both already import the manifest clear helpers)

**Interfaces:**

- Unchanged public signatures: `readHomeCharacterBatchManifest(doc?: Document)`, `readHomeTimelineBatchManifest(doc?: Document)`, `clear…ManifestCacheForTests(doc?)`.

- [ ] **Step 1: Write the failing test** `re-reads the manifest after the manifest script is swapped`.
  - Insert a manifest `<script data-home-character-batch-manifest="true">` with `locale: 'en'` and call `readHomeCharacterBatchManifest(document)`.
  - Remove that script, insert a new one with `locale: 'ja'`, and do not call any clear helper.
  - Assert `readHomeCharacterBatchManifest(document)?.locale === 'ja'`.
  - Swap back to `en` and assert `'en'`.
  - Add the same test for the timeline manifest. Build the manifest payload with the helpers already used in each test file.

- [ ] **Step 2: Run** `pnpm exec vitest run -c config/vitest.config.ts apps/web/src/features/home/commission/batch`. Expected: the new tests FAIL with `'en'` returned.

- [ ] **Step 3: Implement the keying change.**
  - Change each cache to `WeakMap<HTMLScriptElement, Manifest | null>`. Query the script on every call, which is one `querySelector`.
  - When no script exists, return `null` without caching.
  - `clear…ForTests(doc)` deletes the entry for that doc's current script; with no argument it resets the map.

- [ ] **Step 4: Re-run the Step 2 command.** Expected: PASS, including the existing tests.

- [ ] **Step 5: If `apps/web/AGENTS.md` describes the manifest cache, update it.** Search for `manifest` there (around `:29-63`). Then add a gotcha line: "Inline manifests are cached per `<script>` element; ClientRouter swaps replace the element, so never cache per `Document`."

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(web): invalidate batch manifest cache on soft navigation"
```

### Task 2: Loaders persist the loaded-batch count even when a later batch fails (WEB-2)

**Files:**

- Modify: `apps/web/src/features/home/commission/loader/activeCharactersLoader.ts:177-225`
- Modify: `apps/web/src/features/home/commission/loader/archivedCharactersLoader.ts`, in the mount loop around `:206-220`
- Modify: `apps/web/src/features/home/commission/loader/timelineViewLoader.ts`, in the mount loop around `:164-176`
- Test: `activeCharactersLoader.test.ts`, `archivedCharactersLoader.test.ts`, `timelineViewLoader.test.ts` (extend)

**Interfaces:**

- Dataset contract, unchanged names:
  - `panel.dataset.activeBatchesLoadedCount`
  - `panel.dataset.archivedBatchesLoadedCount`
  - `timelinePanel.dataset.timelineBatchesLoadedCount`
- Each loader re-reads its count from these at the start of every load (`readLocalBatchCount`). That is why a stale value causes re-mounts.

- [ ] **Step 1: Write the failing test** `keeps mounted batches counted when a later batch fails`, once per loader.
  - Use a manifest with ≥2 batches. Mock fetch so batch 0 returns a payload and batch 1 rejects (HTTP 500).
  - Request a load that targets batch 1 and await its rejection.
  - Assert the panel's count dataset is `'1'`.
  - Then make batch 1 succeed, request again, and `vi.waitFor` the count to reach `'2'`.
  - Assert every mounted section id appears exactly once: `new Set(ids).size === ids.length`.

- [ ] **Step 2: Run** `pnpm exec vitest run -c config/vitest.config.ts apps/web/src/features/home/commission/loader`. Expected: FAIL. The count stays `'0'` and the sections are duplicated.

- [ ] **Step 3: In each loader, move the post-loop bookkeeping into `finally`.**
  - The bookkeeping is `updateLoadedState(loadedBatchCount, …)` plus the `didChange` sidebar sync or equivalent.
  - Wrap only the mount loop in `try`, and let the error propagate after `finally`.
  - Mark fetched-ahead `payloadRequests` promises as handled (`.catch(() => {})` on the stored promise, while keeping the original for `await`). This stops an abandoned rejection from surfacing as unhandled.

- [ ] **Step 4: Re-run the Step 2 command.** Expected: PASS, including the existing tests.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(web): keep batch counts consistent when a later batch fails"
```

### Task 3: Prefetch uses the same stale-manifest retry as fetch (WEB-3)

**Files:**

- Modify: `apps/web/src/features/home/commission/batch/homeCharacterBatchClient.ts:113-189`
- Test: `homeCharacterBatchClient.test.ts` (extend; reuse its existing 404 / fresh-manifest mocking)

**Interfaces:**

- Produces (module-private): `loadHomeCharacterBatchWithFreshManifestRetry({ batchIndex, doc, status, url, version }): Promise<HomeCharacterBatchPayload>`. Its body is the `try/catch` that `fetchHomeCharacterBatch` passes to `batchRequestQueue.fetch` today.

- [ ] **Step 1: Write the failing tests.**
  - `prefetched stale batch falls back to the fresh manifest`:
    - The manifest has an old version. The old URL returns 404, the fresh manifest returns a new version, and the new URL returns 200.
    - Call `prefetchHomeCharacterBatches({ startBatchIndex: 0, targetBatchIndex: 0 })`, then `await fetchHomeCharacterBatch({ batchIndex: 0 })`.
    - Assert it resolves to the payload, and that the old URL was requested exactly once.
  - `prefetched 404 with unchanged fresh version still rejects`: the fresh manifest returns the same version, so `fetchHomeCharacterBatch` rejects.

- [ ] **Step 2: Run** `pnpm exec vitest run -c config/vitest.config.ts apps/web/src/features/home/commission/batch/homeCharacterBatchClient.test.ts`. Expected: the first test FAILS (rejects with 404).

- [ ] **Step 3: Extract the helper, and pass it as the `load` callback in both `fetchHomeCharacterBatch` and `prefetchHomeCharacterBatches`.** Prefetch keeps its `.catch(() => {})`.

- [ ] **Step 4: Re-run the Step 2 command.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(web): apply the stale-manifest retry to batch prefetch"
```

### Task 4: Batch fetches time out (WEB-6)

**Files:**

- Modify: `apps/web/src/features/home/commission/batch/batchRequestQueue.ts` (export the constant)
- Modify: `homeCharacterBatchClient.ts:63` (`loadHomeCharacterBatch`), `homeTimelineBatchClient.ts:12`
- Test: `homeCharacterBatchClient.test.ts`, `homeTimelineBatchClient.test.ts`, `activeCharactersLoader.test.ts`

**Interfaces:**

- Produces: `export const BATCH_FETCH_TIMEOUT_MS = 15_000` in `batchRequestQueue.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `passes a timeout signal to batch fetches`, in each client test. Assert that the mocked `fetch` received `expect.objectContaining({ signal: expect.any(AbortSignal) })`.
  - `dispatches the load-failed event when a batch fetch aborts`, in `activeCharactersLoader.test.ts`. The fetch mock rejects with `new DOMException('timeout', 'TimeoutError')`. Use `vi.waitFor` to assert that `ACTIVE_CHARACTERS_LOAD_FAILED_EVENT` fired on `win`. The search controller already turns that event into the retry UI; see `activeCharactersLoader.ts:264-266`.

- [ ] **Step 2: Run** the two batch test files plus the active loader test. Expected: the signal tests FAIL.

- [ ] **Step 3: Add a shared helper and use it in both clients.**
  - Add `batchFetchInit(): RequestInit | undefined` to `batchRequestQueue.ts`. It returns `{ signal: AbortSignal.timeout(BATCH_FETCH_TIMEOUT_MS) }` when `typeof AbortSignal.timeout === 'function'`, and `undefined` otherwise. Safari < 16 lacks `AbortSignal.timeout`, and no build target in this repo excludes it.
  - Call `fetch(url, batchFetchInit())` in both clients.
  - Add a test `fetches without a signal when AbortSignal.timeout is missing`: stub `AbortSignal.timeout` to `undefined` with `vi.spyOn` or by reassigning and restoring it, and assert that `fetch` was still called once.
  - If `pnpm` jsdom lacks `AbortSignal.timeout`, the signal test must stub it.

- [ ] **Step 4: Re-run.** Expected: PASS.

- [ ] **Step 5: Document the timeout and the shared prefetch retry.** In the "Stale-HTML manifest fallback" bullet of `apps/web/AGENTS.md` (around `:40`), add: prefetch and fetch share the retry, and batch fetches time out after `BATCH_FETCH_TIMEOUT_MS` when the browser supports `AbortSignal.timeout`.

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(web): time out hung batch fetches"
```

### Task 5: A failing deferred mount or blocked storage no longer tears down the page (WEB-4)

**Files:**

- Modify: `apps/web/src/features/home/homePageClient.ts:96-140`
- Modify: `apps/web/src/features/home/commission/unpublishedInterestClient.ts:116`
- Modify: `apps/web/src/features/home/warning/ageGate.ts`, `warning/AgeGateScript.astro:166, 231`
- Test: `homePageClient.test.ts`, `unpublishedInterestClient.test.ts`, `warning/ageGate.test.ts` (extend all three)

**Interfaces:**

- Produces, in `ageGate.ts`:
  - `readStoredAgeConfirmation(storage: () => Storage): string | null | undefined`. Returns `undefined` when the accessor or `getItem` throws, and `null` when nothing is stored. The two states drive opposite gate behavior.
  - `writeStoredAgeConfirmation(storage: () => Storage, value: string): void`. Swallows errors.
  - The accessor indirection exists because touching `window.localStorage` itself throws.

- [ ] **Step 1: Write the failing tests.**
  - `homePageClient.test.ts`: the existing test `rolls back all mounted features when a deferred mount throws` (around `:166`) encodes the old contract. Rewrite it; do not keep it alongside the new test. The new test is `isolates a throwing deferred mount`:
    - The 1st deferred mount throws and the 2nd returns a cleanup spy.
    - After scheduling runs, the 2nd mount was called, and no critical cleanup was called.
    - Dispose calls the 2nd mount's cleanup.
  - `unpublishedInterestClient.test.ts` › `mounts when localStorage access throws`: pass a `win` whose `localStorage` getter throws `DOMException('denied', 'SecurityError')`. The mount does not throw, and the buttons render their default state.
  - `ageGate.test.ts` (the file already exists; extend it): `readStoredAgeConfirmation(() => { throw new DOMException('x', 'SecurityError') })` returns `undefined`; with an empty `Storage` it returns `null`; `writeStoredAgeConfirmation` with a throwing accessor does not throw.

- [ ] **Step 2: Run** the three test files. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **`homePageClient`:** wrap each deferred mount in its own `try/catch`, `console.error` the error, and continue. Remove the `cleanupAll()` and rethrow in the deferred branch. The critical-mount failure path stays as it is.
  - **`unpublishedInterestClient`:** read `win.localStorage` inside `try`. On failure, use an in-memory `Map`-backed object that implements `getItem` and `setItem`.
  - **`AgeGateScript.astro`:** use the two helpers. If the read threw (`undefined`), do not open the gate. This matches the inline head script, which says "stay closed, as the module does". If the read returned `null` (nothing stored), open the gate as today. A failed write still closes the gate for this page view.

- [ ] **Step 4: Re-run the Step 2 files, then the full gates.**
  - Run `pnpm run test`, then `pnpm run lint`, then `pnpm run typecheck`, sequentially.
  - Then check for orphans with `lsof -nP -iTCP:4173 -sTCP:LISTEN`, and run `VISUAL_OFFLINE=1 pnpm exec playwright test -c config/playwright.config.ts --project web`.
  - Expected: all PASS with no baseline changes. This plan has no visual change.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(web): isolate deferred mounts and guard storage access"
```

## Not in this plan

- WEB-5 (`replaceState(null)`): needs a browser repro before any fix.
- WEB-7 to WEB-14 are backlog; see the audit doc's "Next plans".
