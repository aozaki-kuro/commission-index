# Home First-Paint Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the staged arrivals that make the home page feel like it stutters on open: server-render the
featured keyword chips, stop `scrollReveal` from thrashing layout on mount, and put the hero fade-in in front of
the owner as a previewed choice.

**Architecture:** The featured chip list is a pure function of build-time data, so the island frontmatter renders it
and the lazily loaded search controller adopts the existing markup instead of rebuilding it. Clicks that land before
the controller loads are queued by the always-loaded island mount and replayed once it arrives. `scrollReveal`
splits its mount scan into a read pass and a write pass. The hero fade gets its own class so a change to it cannot
drag scroll reveals along; its final timing is the owner's pick after an A/B.

**Tech Stack:** Astro 7 static site, vanilla TS client modules, Tailwind CSS 4, Vitest (jsdom), Playwright.

**Spec:** No separate spec. The evidence is the 2026-11-03 diagnosis below; traces and frame dumps were taken against
production `https://crystallize.cc/` with Playwright tracing.

## Evidence (2026-11-03, production)

- Desktop, no throttling, age confirmed: first paint 0.80 s shows only the search box, tabs and floating buttons; the
  heading and intro fade in over 0.8–1.0 s (`animate-reveal-up`, 500 ms); both desktop sidebars fade in as well
  (inline `reveal-up` 500 ms, the second with a 120 ms delay); the update block follows about 200 ms later
  (`animation-delay: 200ms`); the featured chip row appears at **~2.3 s**. The main thread has a single 28 ms task.
- Mobile (Moto G viewport, 4x CPU): the same staging, chips at ~1.6 s. The longest task is the first layout of the
  4,156-element DOM (60–90 ms).
- The chip row is rendered `invisible opacity-0` and filled only after `requestIdleCallback` (no timeout) → dynamic
  `import()` of `commissionSearchController` → `initSearchController` → `renderPopularKeywords`. This breaks the
  search rule "no shell-to-content swaps".
- Lighthouse's forced-reflow audit `HomeClientScript…js:1:6227` maps to `scrollReveal.ts` `observeAll`: per entry
  it reads `getClientRects`/`getBoundingClientRect` and then writes `style.opacity = '0'`, so every read after the
  first recalculates style. Expected saving is small (≈8 ms at 4x CPU, ≈2 ms on desktop); the one full layout left
  in that task is legitimate (it follows `data-image-fade=on` on `<html>`).
- PSI and GTmetrix both captured the age gate, so `LIGHTHOUSE_USER_AGENT_TOKEN` no longer matches their user agent.
  Their Speed Index and fully-loaded numbers measure a first visit under a full-page `backdrop-blur-xl`, not the
  confirmed-visitor experience.

## Global Constraints

- Static output only; client islands mount through `bindSoftNavMount` and must cancel deferred work (idle callback,
  dynamic import) in teardown and check a disposed flag after the import resolves (`search/AGENTS.md` Lifecycle).
- Pure logic modules must not read `window`/`document`; new pure derivation goes in `commissionSearchIndex.ts`.
- Keep the DOM ids `#search-popular-keywords`, `#search-keyword-list`, `#search-browse-trigger` and the chip classes
  (`KEYWORD_CHIP_SURFACE_CLASS px-2.5 py-1`; `li` is `shrink-0`, plus `hidden lg:block` from the fifth chip on).
- `popular_keyword_clicked` keeps `{ keyword, from: 'row' }` for row chips and `search_used.source` stays `keyword`
  for chip clicks, including clicks made before the controller loaded.
- Commit messages `type(scope): description`, lowercase, under 72 chars; no attribution trailers.
- Gates before push: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, then
  `pnpm exec playwright test -c config/playwright.config.ts --project web` (run them one after another, never in
  parallel).
- Taste changes (Task 4/5) need a live A/B on fixture data and the owner's pick before any PR.

## Review Focus

1. **No featured keywords set** → row stays `invisible`, no SSR chips; the controller fills it from the entry pool
   exactly as today. Pinned in Task 1 (empty input) and Task 2 (frontmatter branch + controller test).
2. **Featured list with alias variants** (`sailor uniform` / `水手服` in one alias group) → server and client show
   the same collapsed list. Pinned in Task 1 (same function, same seed) and Task 2 (hydration keeps nodes).
3. **Chip tapped before the controller loaded** → the search runs once the controller mounts, reported as
   `from: 'row'` / `source: 'keyword'`. Pinned in Task 2 (island test).
4. **Locale soft navigation** → the new page's SSR chips are adopted, not rebuilt, and the old pending click is
   dropped on teardown. Pinned in Task 2 (island teardown test).
5. **Archived toggle / view switch after mount** → `observeAll(container)` still classifies only that subtree and
   reduced motion still no-ops. Pinned in Task 3 (existing tests stay green plus the new read/write order test).

---

### Task 1: One featured-chip function for server and client

**Files:**

- Modify: `apps/web/src/features/home/search/commissionSearchIndex.ts`
- Modify: `apps/web/src/features/home/search/commissionSearchController.ts:176-187` (`computePopularKeywords`)
- Test: `apps/web/src/features/home/search/commissionSearchIndex.test.ts`

**Interfaces:**

- Consumes: `collapseAliasKeywordVariants`, `dedupeKeywords`, `MAX_FEATURED_KEYWORDS`,
  `MAX_VISIBLE_POPULAR_KEYWORDS` from `commissionSearchDeferred.ts` (value import; `commissionSearchDeferred.ts`
  only type-imports from the index module, so there is no runtime cycle). Do not move these helpers.
- Produces: `computeFeaturedKeywordChips(featured: string[], aliasGroups: SearchSuggestionAliasGroup[]): string[]`
  exported from `commissionSearchIndex.ts`. It returns `[]` when no featured keyword survives dedupe.

- [ ] **Step 1: Write the failing tests** in `commissionSearchIndex.test.ts`:
  - `computeFeaturedKeywordChips returns [] for an empty featured list` → `expect(computeFeaturedKeywordChips([], groups)).toEqual([])`.
  - `computeFeaturedKeywordChips collapses alias variants like the controller did` → with featured
    `['sailor uniform', 'rooftop', '水手服', 'orchard']` and one group `{ term: 'sailor uniform', aliases: ['水手服'] }`,
    the result has length 3, contains `'rooftop'` and `'orchard'`, and contains exactly one of `'sailor uniform'`/`'水手服'`;
    calling it twice returns equal arrays.
  - `computeFeaturedKeywordChips caps at MAX_VISIBLE_POPULAR_KEYWORDS` → eight distinct inputs give length 6.
- [ ] **Step 2: Run** `node_modules/.bin/vitest run -c config/vitest.config.ts apps/web/src/features/home/search/commissionSearchIndex.test.ts` — expected FAIL (`computeFeaturedKeywordChips` is not exported).
- [ ] **Step 3: Implement** `computeFeaturedKeywordChips` as the body of today's featured branch:
      `dedupeKeywords(featured, MAX_FEATURED_KEYWORDS)` → `collapseAliasKeywordVariants(…, aliasGroups, 0x9E3779B9)` →
      `.slice(0, MAX_VISIBLE_POPULAR_KEYWORDS)`. Replace the controller's featured branch with a call to it; the
      entry-pool fallback stays in the controller.
- [ ] **Step 4: Run** the test file above plus `apps/web/src/features/home/search/commissionSearchController.test.ts` — expected PASS.
- [ ] **Step 5: Commit** `refactor(search): share the featured chip computation`.

### Task 2: Server-render the chips and adopt them on hydration

**Files:**

- Modify: `apps/web/src/features/home/search/CommissionSearchIsland.astro` (frontmatter + `#search-keyword-list` +
  `#search-popular-keywords` classes, around lines 316–350)
- Modify: `apps/web/src/features/home/search/commissionSearchController.ts` (`renderPopularKeywords` lines 84–106,
  `prevPopularKeywordsKey` line 318, `initSearchController` signature line 112)
- Modify: `apps/web/src/features/home/search/commissionSearchIsland.ts`
- Modify: `apps/web/src/features/home/search/AGENTS.md` ("Keyword row" paragraph and the browse-popover placement
  rationale), `apps/web/test/visual/icon-regression.spec.ts:13-18` (comment only)
- Test: `apps/web/src/features/home/search/commissionSearchController.test.ts`,
  `apps/web/src/features/home/search/commissionSearchIsland.test.ts`,
  `apps/web/test/visual/search-help.spec.ts` (new case)

**Interfaces:**

- Consumes: `computeFeaturedKeywordChips` (Task 1); `KEYWORD_CHIP_SURFACE_CLASS` from `commissionSearchConstants.ts`.
- Produces:
  - Chip markup contract, identical on server and client: `<li class="shrink-0[ hidden lg:block]"><button type="button" data-keyword="<keyword>" class="<KEYWORD_CHIP_SURFACE_CLASS> px-2.5 py-1"><keyword></button></li>`, `hidden lg:block` for index ≥ 4.
  - `initSearchController(root: HTMLElement, options?: { pendingKeyword?: string }): (() => void) | undefined`.

Decisions (made here, not by the implementer):

- **Row visibility:** when the SSR chip list is non-empty, `#search-popular-keywords` renders without
  `invisible opacity-0` (keep the transition classes). When empty, it renders exactly as today.
- **Hydration:** `prevPopularKeywordsKey` is initialized from the DOM — the `data-keyword` values of
  `#search-keyword-list [data-keyword]` joined with `'\0'` — so the first recompute leaves matching SSR nodes alone.
- **Listeners:** chips get no per-button listeners. The controller binds one `pointerdown` (→
  `prepareSearchInteraction`) and one `click` (→ `applyPopularKeyword(keyword, 'row')`) on `#search-keyword-list`,
  resolving the chip by `closest('[data-keyword]')`; teardown removes both. `renderPopularKeywords(listEl, keywords)`
  becomes markup-only and is still used for the entry-pool fallback.
- **Clicks before the controller loads:** chips stay `<button>` (an `<a>` would pick up the global link underline and
  log the click as `url_query`). `mountCommissionSearchIsland` binds a delegated `click` on `#search-keyword-list`
  until the controller mounts: it stores the chip's `data-keyword` as the pending keyword, cancels the idle callback
  and starts the `import()` immediately (once). After the import, it calls
  `initSearchController(root, { pendingKeyword })` when a keyword is pending and `initSearchController(root)` otherwise
  (the existing island test asserts the one-argument call), removes its own listener, and the controller applies the pending
  keyword with `applyPopularKeyword(pendingKeyword, 'row')` after its own init recompute. Teardown drops the pending
  keyword and the listener.

- [ ] **Step 1: Write the failing controller tests** in `commissionSearchController.test.ts` (reuse `mountSearchRoot`):
  - `adopts server-rendered chips without rebuilding them` → pre-render two chips with the markup contract for
    `featuredKeywords: ['alpha', 'beta']`, keep a reference to the first `<button>`, init, `await vi.waitFor` one
    recompute, then `expect(document.querySelector('#search-keyword-list button')).toBe(firstButton)`; clicking it
    gives `trackedEvents('popular_keyword_clicked')` `[{ keyword: 'alpha', from: 'row' }]`.
  - `applies a pending keyword passed at init` → `initSearchController(root, { pendingKeyword: 'alpha' })` leads to
    `popular_keyword_clicked` `[{ keyword: 'alpha', from: 'row' }]` and eventually `search_used` `[{ source: 'keyword' }]`.
  - Keep `reports a featured chip click as from row…` green (client-rendered path).
- [ ] **Step 2: Write the failing island tests** in `commissionSearchIsland.test.ts` (it already stubs
      `requestIdleCallback` and mocks the controller module):
  - `a chip click before hydration imports the controller now and hands it the keyword` → root contains
    `<ul id="search-keyword-list"><li><button data-keyword="alpha"></button></li></ul>`, mount, click the button
    without running idle callbacks, `await vi.waitFor(() => expect(initSearchController).toHaveBeenCalledWith(root, { pendingKeyword: 'alpha' }))`, and `cancelIdleCallback` was called.
  - `teardown before the import resolves drops the pending keyword` → click, call cleanup, flush; `initSearchController` not called.
- [ ] **Step 3: Run** `node_modules/.bin/vitest run -c config/vitest.config.ts apps/web/src/features/home/search` — expected FAIL on the four new cases.
- [ ] **Step 4: Implement** the frontmatter (`computeFeaturedKeywordChips(featuredKeywords, suggestionAliasGroups)`),
      the markup and class branch, the controller changes and the island queue exactly as decided above.
- [ ] **Step 5: Run** the same Vitest command — expected PASS.
- [ ] **Step 6: Add the Playwright "no shell swap" case** to `apps/web/test/visual/search-help.spec.ts`:
      `featured chips are present before the search controller loads` → `await page.route('**/commissionSearchController*', route => route.abort())`, `page.goto('/')`, then
      `expect(page.locator('#search-popular-keywords')).not.toHaveClass(/invisible/)` and
      `expect(page.locator('#search-keyword-list [data-keyword]')).toHaveCount(5)` (fixture `featuredSearchKeywords`
      has five; verify the collapsed count against the fixture's alias rows and pin the real number).
      Confirm the dev-server module URL actually matches the route glob before trusting a pass.
- [ ] **Step 7: Run** `pnpm exec playwright test -c config/playwright.config.ts --project web` — expected PASS with
      **no** snapshot changes (the icon-regression specs already wait for chips, so their pixels must not move). Any
      snapshot diff is a markup mismatch between server and client: fix it, never update the baseline.
- [ ] **Step 8: Update docs** — `search/AGENTS.md` "Keyword row": featured chips are server-rendered from
      `computeFeaturedKeywordChips` and adopted on hydration; only the entry-pool fallback is client-rendered and keeps
      the row invisible until filled; pre-hydration clicks are queued by the island. Rewrite the popover-placement reason
      ("…because the row can be `invisible` until populated in the fallback path…"). Update the icon-regression comment.
- [ ] **Step 9: Commit** `perf(search): server-render the featured keyword chips`.

### Task 3: Read-then-write scan in scrollReveal

**Files:**

- Modify: `apps/web/src/features/home/commission/scrollReveal.ts` (`observeAll`)
- Modify: `apps/web/AGENTS.md` ("Hidden DOM + observers" bullet: one clause on the read/write split)
- Test: `apps/web/src/features/home/commission/scrollReveal.test.ts`

**Interfaces:**

- Consumes / produces: none outside the module; `mountScrollReveal(): () => void` is unchanged.

- [ ] **Step 1: Write the failing test** `classifies every entry before hiding any of them` → render three
      `[data-commission-entry]` elements, stub `getClientRects` to return one rect, stub `getBoundingClientRect` so the
      first is above the fold (`top: 0`) and the others below (`top: 5000`), and inside that stub record whether any
      entry already has `style.opacity === '0'`. After mount: the recorded flag is never true, the two below-fold entries
      have `opacity: 0` and are observed, the first has `data-revealed`.
- [ ] **Step 2: Run** `node_modules/.bin/vitest run -c config/vitest.config.ts apps/web/src/features/home/commission/scrollReveal.test.ts` — expected FAIL on the new case only.
- [ ] **Step 3: Implement** `observeAll(root)` as two passes over the same element list: pass 1 skips already
      revealed elements and records `{ el, renderable, aboveFold }` (only reading geometry for renderable ones); pass 2
      sets `data-revealed` for above-fold entries and calls `prepareEntry` + `io.observe` for the rest. Keep the per-root
      argument, the reduced-motion early return and the `MutationObserver` wiring unchanged.
- [ ] **Step 4: Run** the same command — expected PASS, all existing cases included.
- [ ] **Step 5: Verify with a trace** against a fixture production build:
      `FACT_SOURCE_DIR=generated-fixture node --import tsx apps/admin-worker/scripts/writeOfflineFactSource.ts`, then
      `FACT_SOURCE_DIR=generated-fixture pnpm -C apps/web exec astro build --clean` and `pnpm -C apps/web exec astro preview`
      (start through `.claude/launch.json` / `preview_start`). Run the session's trace script (desktop and 4x mobile) on
      `http://localhost:4321/` before and after. Pass: inside the `FunctionCall HomeClientScript…` task that runs
      `mountScrollReveal`, at most one `Layout` and no per-entry `UpdateLayoutTree` series. Record before/after task
      durations in the PR body.
- [ ] **Step 6: Commit** `perf(web): read entry geometry before hiding entries in scroll reveal`.

Tasks 1–3 ship as one PR (standing authorization once the gates pass). They do not wait on Task 4.

### Task 4: Hero fade A/B (owner gate, no PR)

**Files:**

- Modify (preview only, not committed): CSS override injected in the in-app browser.

Decoupling first: the hero fade today is three things — `.animate-reveal-up` on the Description block and its update
block (`Description.astro:24`, `:72`, delay 200 ms), and two inline `animation: reveal-up 500ms …` styles on the
desktop sidebars (`DesktopSidebarNav.astro:48`, `:178`, the second delayed 120 ms). `scrollReveal.ts` reuses
`.animate-reveal-up` for entries, so the A/B must override only the hero selectors
(`#--------Description--------`, `#--------Description-------- > .animate-reveal-up`, the two sidebar roots), never
the shared class.

- [ ] **Step 1:** Start the fixture dev server via `preview_start` and capture desktop (1440×900) and mobile (412×823)
      first-second frame strips for each variant, injected as a `<style>` override:
  - **A — keep:** no override.
  - **B — short, no stagger:** `animation-duration: 200ms; animation-delay: 0ms` on all four hero targets.
  - **C — none:** `animation: none` on all four hero targets.
- [ ] **Step 2:** Show the owner the three strips plus a live toggle in the browser pane; recommend B (keeps a sense of
      arrival, collapses four staged arrivals into one ≤200 ms beat). Record the owner's pick and the date.

**Result (2026-11-03):** B. The owner could not view the preview and delegated the pick to the advisor: the stagger was
the perceived stutter, and B keeps a short arrival. Cost if wrong: one CSS timing revert.
**Superseded the same day by C:** with B the intro paragraph became the LCP element at the end of its fade (PSI
mobile LCP 1.1 s → 2.0–3.8 s, element render delay 570 ms); with no fade it paints with the page.

### Task 5: Ship the picked hero fade (fill in after Task 4)

**Files:**

- Modify: `apps/web/src/styles/globals.css` (new `.animate-hero-reveal`, leaving `.animate-reveal-up` for scroll reveals),
  `apps/web/src/features/home/blocks/Description.astro:24,72`, `apps/web/src/features/home/nav/DesktopSidebarNav.astro:48,178`
- Modify: `apps/web/AGENTS.md` (record the owner ruling and that the hero fade is separate from scroll reveals)

- [ ] **Step 1:** Introduce `.animate-hero-reveal` with the picked timing (A: today's values; B: 200 ms, no delays;
      C: delete the class uses and inline animations instead of adding a class) and move the four hero targets to it.
- [ ] **Step 2:** Run the gates and the web Playwright project; inspect any home snapshot delta on desktop and mobile
      before updating it.
- [ ] **Step 3: Commit** `style(web): <picked variant> the home hero fade-in` and open the second PR.

## Owner decisions kept out of this plan

| Option                                               | Gain                                                                                                   | Cost                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Inline CSS (`build.inlineStylesheets: 'always'`)     | One round trip on first visits (PSI estimate 330 ms on slow 4G; far less on desktop)                   | +13.5 KiB on every HTML fetch; `/` is `no-cache` and deploys are near-daily                                                  |
| Remove `<ClientRouter />`                            | Drops a 6.5 KiB script and an ~84 ms (4x CPU) forced layout before first paint                         | Language soft navigation (~1% of mobile sessions) becomes a full load; every island's lifecycle and both AGENTS files change |
| Fix or drop the `LIGHTHOUSE_USER_AGENT_TOKEN` bypass | PSI/GTmetrix would measure the confirmed-visitor page again (or honestly measure the gate, if dropped) | Dropping it lowers lab scores; keeping it needs a UA check that tools no longer send                                         |
