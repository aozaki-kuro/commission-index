# Static Home Listing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page's hand-rolled deferred batch loading with fully static HTML (native `loading="lazy"`
images keep the bytes deferred), deleting the JSON batch pipeline, the duplicate client renderer (audit P9), and
making every commission crawlable without JS.

**Architecture:** `StaticCommissionSections.astro` renders every active section, every archived section (inside a
`hidden` container) and every timeline year at build time. Client JS shrinks to three jobs: show/hide archived
(`archivedCharactersToggle.ts`), resolve a hash to the active panel and expand archived if needed
(`homeHashTarget.ts`), and the existing search / nav / scroll features minus every "load batch first" branch.
Native lazy images, the existing scroll reveal, and a new on-load image fade (`imageFadeIn.ts`) give the
one-by-one feel.

**Tech Stack:** Astro 7 static output, vanilla TS client modules, Vitest (jsdom per file), Playwright (web fixture).

**Spec:** this document (owner request 2026-10-25: "lazy loading is batched — is there a more elegant way, ideally an
existing open-source library"). Evidence and rulings below stand in for a separate spec.

## Evidence (measured 2026-10-25 on `4d0396b`, real export, `pnpm -C apps/web build`)

| Build                                                  | `index.html` raw | gzip   | brotli | entries | elements | search JSON files |
| ------------------------------------------------------ | ---------------- | ------ | ------ | ------- | -------- | ----------------- |
| Today (1 active section + 1 year)                      | 194,904          | 28,135 | 21,532 | 46      | 1,066    | 61                |
| Active + timeline all inline (archived still deferred) | 501,764          | 48,236 | 29,099 | 228     | 3,310    | 31                |

- Data: 13 characters, 141 commissions (2 hidden). Archived batches for `en` are 7.2 KB br more, so fully static
  lands at about **36 KB br** and about 4k elements. The inactive view panel and the collapsed archived container are
  `display: none`, so they cost parse time but no layout. Their `loading="lazy"` images never load.
- Today a full scroll fetches up to 18 batch files per locale plus manifests (142 KB br across 3 locales), and every
  HTML page carries 20.6 KB of inline manifests.
- About 5.7k lines (code plus tests) live in `commission/batch/`, `commission/loader/` and `server/home*Batch*`. That
  code also coordinates search, nav, the hash shell and scroll restore around batch arrival.

## Rulings

- **Ruling: delete the deferral rather than swap in a library.**
  - _TanStack Virtual / virtua:_ all source images share one aspect, 1280:525. This was verified 2026-10-25: 140 are
    1280×525 and one is 2048×840. So height estimation is not the obstacle; the rest is.
    - Entries outside the window are not in the DOM. That breaks permalinks, Ctrl+F and no-JS crawling.
    - DOM-based search filtering, scroll restore, scroll depth, scroll reveal and sidebar tracking would all need
      rewriting against a data model.
    - Rows would have to be rendered from JSON, which keeps the dual renderer (P9).
    - virtua has no official vanilla binding.
    - At about 2k visible elements there is nothing to virtualize.
    - Revisit only at thousands of visible entries.
  - _Astro Server Islands:_ these need SSR, and the site is static-only.
  - _htmx (`hx-trigger="revealed"` plus Astro-emitted HTML fragments):_ this is the only real fit. It would also end
    the dual renderer. But it replaces only fetch+render, about a third of the code. Hash-to-unloaded-target, stale
    fallback, search re-indexing and the archived generation counter all stay. It also adds about 14 KB br of JS on
    top of 25 KB.
  - At 141 entries, the browser's native lazy images _are_ the off-the-shelf solution.
  - Cost if wrong: HTML grows about +15 KB br per page. If the collection grows past roughly 1,000 visible entries,
    revisit with htmx fragments. That is the fallback design, not this plan.
- **Ruling: keep shared entry ids across the two views.** Character and timeline entries already share
  `<section>-commission-<publicId>` ids today (verified in `dist/index.html`). `getHashTarget`
  (`lib/navigation/hashAnchor.ts`) resolves to the copy in the active panel, so one permalink works in both views.
  Do not add a timeline prefix: it would break shared links.
- **Ruling: keep DOM contract names.** Keep `data-load-archived-characters`, `data-archived-visibility`,
  `data-archived-sections-container`, `data-archived-divider`, `data-archived-sections-placeholder`,
  `data-total-entries`, and the archived event names and string values. Remove `data-active-sections-loaded`,
  `data-active-batches-loaded-count`, `data-archived-loaded`, `data-archived-batches-loaded-count`,
  `data-timeline-loaded`, `data-timeline-batches-loaded-count`, every `*-sentinel`, `*-sections-container` (except
  archived and timeline) and both inline manifest `<script>`s.
- **Ruling: keep UI copy.** "Load / 載入 / 読み込む" stays (owner's call to relabel later).
- **Ruling: no `content-visibility`.** Visible layout stays at about 2k elements. Revisit only if the final gate shows
  a Lighthouse mobile TBT regression over 50 ms.
- **Ruling: stale-HTML search fallback moves to a 1-field endpoint.** `/search/home-search-version.json` returns
  `{"v": "<version>"}` with `Cache-Control: no-cache` and is fetched only after a `home-search-entries.<v>.json` 404,
  which keeps today's retry-once behavior.

## Global Constraints

- `apps/web` imports use `@layouts/*`, `@features/*`, `@lib/*`; no `#` aliases.
- Client islands mount via `bindSoftNavMount` from `homePageClient.ts`; never from top-level module code; no
  `pagehide` reliance under ClientRouter (persistence keeps its existing `pagehide`/`beforeunload` pair).
- Run pnpm commands sequentially (never in parallel in one checkout).
- DOM tests: `// @vitest-environment jsdom`, wait with `vi.waitFor`, no source-string assertions.
- Web Playwright specs call `expectFixtureData(page)` first and run only against the fixture server.
- Branch from `origin/master`; commits `type(scope): summary`, no trailers.

## Review Focus

1. Cold load `/#<archived entry id>` must expand archived and land on the entry (today a manifest lookup does this).
   This is covered in Task 1 and must stay green after Task 3.
2. Cold load `/?view=timeline#<entry id>` must land on the **timeline** copy, not the hidden character copy. Native
   browser scrolling targets the first id in document order, which is in the hidden panel. Covered in Tasks 1 and 4.
3. Reload with archived expanded and scrolled into it must restore both visibility and position. This depends on
   mount order: the toggle restores visibility before scroll restore runs. Covered in Tasks 1 and 3.
4. A search that matches only archived entries while archived is collapsed must still show the hidden-matches notice
   and the "load archived" command. Covered in Task 3 (`commissionSearchModel.test.ts`).
5. A stale open tab after a deploy (search entries 404) must recover once through the version endpoint. Covered in
   Task 2.

---

### Task 1: Characterization E2E for navigation behavior

Pin today's user-visible behavior so every later task proves it unchanged. No production code changes.

**Files:**

- Create: `apps/web/test/visual/home-navigation.spec.ts`

**Interfaces:**

- Produces: the spec file every later task re-runs. Fixture facts it relies on, from
  `apps/admin-worker/scripts/webVisualFixture.ts`:
  - active characters: `Lumi Verde` (ids 101–104) and `枫霜 Kaede` (201, 202); archived: `Orion Vale` (301, 302);
  - years 2022–2025;
  - `publicId(n) = 00000000-0000-4000-8000-<n padded to 12>`.
  - Read section ids from the sidebar link `href`s (`[id="Character List"] a`), never hard-code kebab names.

- [ ] **Step 1: Write the spec.** `beforeEach` sets `hasConfirmedAge` like `search-help.spec.ts`. Viewport 1440×1000
      unless a test says otherwise. Each test calls `expectFixtureData`. Tests:
  - `deep link to a deferred active entry lands on it`:
    1. `goto('/#<kaede>-commission-<publicId(202)>')`.
    2. Poll that the entry is visible and its `boundingBox().y` is in `[0, 250]`.
  - `deep link to an archived entry expands archived and lands on it`:
    1. Goto the archived entry for 302.
    2. Expect the character panel to have `data-archived-visibility="visible"`.
    3. Expect the entry's y to be in `[0, 250]`.
  - `timeline deep link lands on the timeline copy`:
    1. `goto('/?view=timeline#<lumi>-commission-<publicId(101)>')` (101 is dated 2024, a deferred year).
    2. Locate the copy inside `[data-commission-view-panel="timeline"]`: visible, y in `[0, 250]`.
  - `sidebar jump to a deferred character lands on its title`: click the `枫霜 Kaede` sidebar link and expect its
    `h2` y to be in `[0, 250]`.
  - `archived toggle shows and collapses`:
    1. Click `[data-load-archived-characters="true"]` inside the panel.
    2. `Orion Vale` `h2` becomes visible.
    3. Close the sidebar `<details data-sidebar-archived-details>`; expect `data-archived-visibility="hidden"` and
       the `h2` hidden.
  - `reload restores expanded archived position`:
    1. Expand archived and scroll the 301 entry to the top.
    2. `page.reload()`.
    3. Expect visibility `visible` and `|scrollY − before| ≤ 40`.
  - Run the three deep-link tests and the reload test at 390×844 too (`for` loop over two viewports, same as
    `search-help.spec.ts`). The sidebar and `<details>` tests are desktop-only: below `lg` the sidebar is replaced by
    the hamburger menu.
- [ ] **Step 2: Run against today's code.**
      Run: `pnpm exec playwright test -c config/playwright.config.ts --project web home-navigation`
      Expected: all PASS. A failure means today's behavior differs from the assumption. Fix the assertion to match
      today, never the product code, and note the change in the commit body.
- [ ] **Step 3: Commit.** `test(web): pin home hash, archived and restore navigation`

### Task 2: Decouple search index version and image constants from batch modules

**Files:**

- Create: `apps/web/src/features/home/commission/commissionImageConstants.ts`
- Create: `apps/web/src/pages/search/home-search-version.json.ts`
- Modify: `apps/web/src/features/home/server/batchPayloadBuilder.ts` (re-import constants; deleted in Task 5)
- Modify: `apps/web/src/features/home/pages/HomePage.astro:20-24`,
  `apps/web/src/features/home/commission/ProtectedCommissionImage.astro:3-7`
- Modify: `apps/web/src/features/home/server/StaticCommissionSections.astro` (root `div`)
- Modify: `apps/web/src/features/home/search/commissionSearchDeferred.ts:29-110,326-354`
- Modify: `apps/web/public/_headers`
- Test: `apps/web/src/features/home/search/commissionSearchDeferred.test.ts`

**Interfaces:**

- Produces:
  - `COMMISSION_IMAGE_WIDTH`, `COMMISSION_IMAGE_SIZES`, `COMMISSION_INLINE_IMAGE_WIDTHS`, moved verbatim, from
    `@features/home/commission/commissionImageConstants`.
  - Root `<div id="--------Commissions--------" data-search-index-version={buildHomeSearchEntriesArtifact().version}>`.
  - `readHomeSearchIndexVersion(doc?: Document): string | null`.
  - `fetchFreshHomeSearchIndexVersion(): Promise<string | null>` (GET `/search/home-search-version.json`,
    `cache: 'no-store'`).
  - `buildHomeSearchIndexUrl(version?: string | null): string`, which throws if no version is available. There is no
    unversioned route.

- [ ] **Step 1: Rewrite the failing tests** in `commissionSearchDeferred.test.ts`. Drop manifest fixtures and
      `clearHomeCharacterBatchManifestCacheForTests`.
  - `builds the index URL from the root data attribute`: root with `data-search-index-version="abc"` gives
    `/search/home-search-entries.abc.json`.
  - `retries once with the fresh version after a 404`:
    1. Stub `fetch`: the first entries URL returns 404, the version endpoint returns `{v:'def'}`, and
       `.def.json` returns 2 entries.
    2. Expect 2 entries and exactly 3 fetch calls.
  - `gives up after one retry`: the second entries URL also returns 404. Expect a rejection and 3 calls.
  - `weights active entries using data-character-status`:
    1. Build a DOM with one `data-character-status="active"` section and one `"archived"` section.
    2. Seeded random `0.5` picks the active entry (`ACTIVE_WEIGHT = 0.75`).
- [ ] **Step 2: Run, expect FAIL.** `pnpm exec vitest run -c config/vitest.config.ts commissionSearchDeferred`
- [ ] **Step 3: Implement.** In `pickWeightedEntry`, replace the manifest reads with
      `doc.getElementById(sectionId)?.dataset.characterStatus === 'active'`. Leave `loadDeferredEntryBatch` alone; it is
      deleted in Task 4. Add `_headers`:

  ```text
  /search/home-search-version.json
    Cache-Control: no-cache
  ```

  The endpoint follows `home-search-entries.[v].json.ts` (prerendered `GET`, `JSON.stringify({ v })`).

- [ ] **Step 4: Run, expect PASS.** Then: `pnpm run typecheck`, then
      `pnpm exec playwright test -c config/playwright.config.ts --project web`. All pass.
- [ ] **Step 5: Commit.** `refactor(web): read search index version from page, not batch manifest`

### Task 3: Static archived sections with a visibility toggle

**Files:**

- Create: `apps/web/src/features/home/commission/archivedCharactersState.ts`. This moves the visibility half of
  `loader/archivedCharactersEvent.ts`.
- Create: `apps/web/src/features/home/commission/archivedCharactersToggle.ts` (+ `archivedCharactersToggle.test.ts`)
- Create: `apps/web/src/features/home/homeHashTarget.ts` (+ `homeHashTarget.test.ts`); contract in Task 4
- Delete: `apps/web/src/features/home/commission/loader/archivedCharactersLoader.ts` (+ test)
- Modify:
  - `StaticCommissionSections.astro` (archived block);
  - `homePageClient.ts` (+ test);
  - `homeScrollRestore.ts` (+ test), archived parts only;
  - `nav/sidebarNavEnhancer.ts`, `nav/hamburger/mobileHamburgerMenu.ts`, `nav/homeNavTargetClient.ts` (+ tests),
    archived branches only;
  - `search/commissionSearchController.ts`, `commissionSearchModel.ts`, `commissionSearchPanelState.ts`,
    `commissionSearchDomSync.ts`, `commissionSearchIndex.ts` (+ tests), archived parts only;
  - `commission/scrollReveal.ts` (+ test).

**Interfaces:**

- Consumes: Task 2 output.
- Produces (`archivedCharactersState.ts`): these keep their current names, signatures and event string values.
  - `ARCHIVED_CHARACTERS_SHOW_REQUEST_EVENT`, `ARCHIVED_CHARACTERS_COLLAPSE_REQUEST_EVENT`,
    `ARCHIVED_CHARACTERS_COLLAPSED_EVENT`, `ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT`;
  - `type ArchivedCharactersVisibility`;
  - `isArchivedCharactersVisible`, `requestArchivedCharactersVisibility`, `dispatchArchivedCharactersStateChange`;
  - `readSavedArchivedCharactersVisibility`, `persistArchivedCharactersVisibility`,
    `resolveReloadArchivedCharactersVisibility`, `persistReloadArchivedCharactersVisibility`;
  - `hasArchivedCharacterTarget`.
  - `ArchivedCharactersState` becomes `{ visibility: ArchivedCharactersVisibility }`.
  - Re-export from `loader/archivedCharactersEvent.ts` until Task 4 so active/timeline code still compiles.
- Produces: `mountArchivedCharactersToggle({ win?, doc? }?): () => void`.
  - Handles show requests synchronously in the event listener, so `homeHashTarget` (Task 4) can show archived and
    then scroll in the same frame.
  - Owns the button click, the SHOW/COLLAPSE events, toggling `hidden` on the container / divider / placeholder,
    writing `data-archived-visibility`, dispatching the state change, and the session persistence pair.
  - Restores saved visibility during mount.
- Mount order in `homePageClient.ts` critical list: `mountArchivedCharactersToggle`, then `mountHomeHashTarget`, then
  `mountHomeScrollRestore`.

- [ ] **Step 1: Failing toggle tests** (`archivedCharactersToggle.test.ts`, jsdom):
  - `button click shows the container and hides the placeholder`;
  - `collapse request hides the container but keeps the archived sections in the DOM`;
  - `show request is applied synchronously` (`dispatchEvent`, then assert the container is visible with no await);
  - `restores saved visible state on mount`;
  - `state change event carries the new visibility`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm exec vitest run -c config/vitest.config.ts archivedCharactersToggle`
- [ ] **Step 3: Implement the toggle and state module.** In `StaticCommissionSections.astro`, render
      `archivedChars.map(Listing status="archived")` inside `<div data-archived-sections-container="true" class="hidden">`.
      Drop the archived sentinel and the archived counts/loaded attributes.
      Add a pre-paint branch to the existing `is:inline` script at the end of `StaticCommissionSections.astro`. It
      runs for every view, not only `?view=timeline`. When `location.hash` (decoded) names an element inside
      `[data-archived-sections-container]`: 1. remove `hidden` from the container and the divider; 2. add `hidden` to the placeholder; 3. set `data-archived-visibility="visible"` on the character panel.

      Native fragment scrolling then lands without a top-of-page flash. Today the head script hides the shell for
      out-of-DOM hashes, and that guard stops firing once archived ids are always in the DOM. `mountArchivedCharactersToggle`
      reads the panel attribute on mount instead of assuming `hidden`.
      Extend the Task 1 archived deep-link test: right after `page.goto(url, { waitUntil: 'domcontentloaded' })`,
      before any module script effect, assert `data-archived-visibility="visible"` and `window.scrollY > 0`.

- [ ] **Step 4: Update consumers.**
  - **Search:**
    - The archived state becomes `archivedVisible` only.
    - `getDisplayMetrics`: `canHaveHiddenArchivedMatches = mode === 'character' && !archivedVisible`.
    - The `LOAD_ARCHIVED_COMMAND_VALUE` command calls `requestArchivedCharactersVisibility(win, 'visible')`.
    - Remove `requestArchivedCharactersLoad` / `archivedBatchCount` from the model key and DOM sync.
    - Add a test: `archived-only match while collapsed shows hidden-matches notice` (Review Focus 4).
  - **Nav:** an archived target that is not visible goes to `revealArchivedHomeNavTarget`; everything else uses the
    native jump. Delete the `prefetchArchivedTarget` paths.
    - Because the toggle now answers synchronously, `revealArchivedHomeNavTarget` must keep subscribing to
      `ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT` _before_ it calls `requestArchivedVisibility` (it does today, at
      `homeNavTargetClient.ts:152-157`).
    - Pin the order with a test in `homeNavTargetClient.test.ts`:
      `calls onVisible when the show request is answered synchronously`.
  - **Scroll restore:** drop `requestArchivedLoad` / `archivedTotalBatchCount`.
  - **`scrollReveal`:** extend the class-mutation rescan to `[data-archived-sections-container]` so entries inside a
    `hidden` container are not marked entered (AGENTS rule "Hidden DOM + observers"). Add a test:
    `entries inside the hidden archived container are not revealed until shown`.
  - **Archived hash:** create `homeHashTarget.ts` now, as specified in Task 4's Interfaces and tests, and mount it
    after the toggle. The surviving active/timeline loaders may also scroll to the same hash; a second scroll to the
    same target is harmless, and Task 4 deletes theirs.
- [ ] **Step 5: Gate.**
  1. `pnpm run lint`, then `pnpm run typecheck`, then `pnpm run test`.
  2. `pnpm exec playwright test -c config/playwright.config.ts --project web`: Task 1 spec green.
- [ ] **Step 6: Commit.** `refactor(web): render archived sections statically behind a toggle`

### Task 4: Static active sections and timeline; one hash owner

**Files:**

- Modify: `apps/web/src/features/home/homeHashTarget.ts` (created in Task 3; becomes the only hash owner)
- Delete: `commission/loader/activeCharactersLoader.ts`, `timelineViewLoader.ts`, `activeCharactersEvent.ts`,
  `timelineViewEvent.ts`, `loaderTestFixtures.ts` (+ tests). Move `archivedCharactersEvent.ts` callers to
  `archivedCharactersState` and delete it; `loader/` is then empty.
- Modify:
  - `StaticCommissionSections.astro`: all `activeChars`, all `timelineGroups`; drop the active/timeline sentinels and
    containers. Delete `readTimelineBatchManifest`, `normalizeTargetId` and `preloadTimelineSections` from the inline
    `?view=timeline` script, and keep its panel/toggle sync.
  - `HomePage.astro`:
    - lines 146–152 are one rule with two selectors. Drop only the `html[data-home-hash-restoring='true']` selector.
      The `data-home-scroll-restoring` selector stays, because reload restore still uses it.
    - Delete the head branch (lines 211–225) that sets `data-home-hash-restoring` for out-of-DOM hashes.
  - `homeScrollRestore.ts`: delete the batch loop, the loaded-event listeners, `RESTORE_BATCH_WINDOW` and
    `revealHashRestoreShell`. `tryRestore` becomes `completeRestore({ schedule: true })`.
  - `blocks/updateLinks.ts`: delete the deferred branch.
  - `nav/homeNavTargetClient.ts`: keep only `revealArchivedHomeNavTarget`.
  - `nav/sidebarNavEnhancer.ts`, `nav/hamburger/mobileHamburgerMenu.ts`: delete the active/timeline deferred
    branches and `isDeferredTarget`.
  - `search/*`: delete prefetch, `requestActiveLoadBeforeFiltering`, `loadDeferredEntryBatch` and
    `SHUFFLE_DEFERRED_LOAD_TIMEOUT_MS`. The panel state is `{ archivedVisible }`.
  - Delete `commissionSearchFocusPrefetch.test.ts`.

**Interfaces:**

- Consumes: `getHashTarget`, `scrollToHashTargetFromHrefWithoutHash` (`@lib/navigation/hashAnchor`);
  `requestArchivedCharactersVisibility`, `isArchivedCharactersVisible` (Task 3).
- Produces: `mountHomeHashTarget({ win?, doc?, deps?: { scrollToHashWithoutWrite } }?): () => void`.
  - On mount and on `hashchange`, resolve `getHashTarget(location.hash)`.
  - If the target is inside `[data-archived-sections-container]` and archived is hidden, request `visible`. This is
    applied synchronously per Task 3.
  - Then `requestAnimationFrame(() => scrollToHashWithoutWrite(hash))`. Do nothing for an empty or unknown hash.

- [ ] **Step 1: Tests** (`homeHashTarget.test.ts`, jsdom, scroll dep stubbed; written in Task 3, extended here with
      the shared-id case):
  - `scrolls to the active-panel copy when ids are shared` (two panels, same id; timeline active);
  - `expands archived before scrolling to an archived target`;
  - `ignores unknown hashes`;
  - `reacts to hashchange`;
  - `dispose removes the hashchange listener`.
- [ ] **Step 2: Run.** `pnpm exec vitest run -c config/vitest.config.ts homeHashTarget`. The shared-id case fails
      if Task 3 resolved with `getElementById` instead of `getHashTarget`.
- [ ] **Step 3: Implement, applying the deletions and modifications listed above.** Rewrite affected unit tests to assert the static behavior, e.g.
      `sidebar click on an active section uses native jump` and `search filters without requesting loads`. Do not port
      batch-ordering tests.
- [ ] **Step 4: Gate.**
  1. Lint, then typecheck, then test.
  2. Web Playwright: Task 1 spec green on both viewports. Review Focus 2 is the timeline deep-link test.
- [ ] **Step 5: Commit.** `refactor(web): render all home sections statically`

### Task 5: Delete the batch pipeline and update docs

**Files:**

- Delete:
  - `apps/web/src/features/home/commission/batch/` (all);
  - `apps/web/src/features/home/server/home{Character,Timeline}Batch*.ts`, `homeCharacterBatchPayload.ts`,
    `homeTimelineBatchPayload.ts`, `batchPayloadBuilder.ts`, `homeBatchMetadata.test.ts` (+ tests);
  - `apps/web/src/pages/search/home-character-batches/`, `home-character-manifest/`, `home-timeline-batches/`,
    `home-timeline-manifest/`.
- Modify:
  - `apps/web/public/_headers`: remove the 4 batch/manifest rules.
  - `apps/web/src/features/home/server/StaticCommissionSections.astro`: remove the remaining plan/manifest imports
    and the two inline manifest scripts.
  - `apps/web/src/lib/pipeline/homeSearchEntries.ts:76`: fix the comment that mentions the manifest.
  - `apps/web/AGENTS.md`:
    - Replace the "Deferred sections", "Content-hashed batch filenames", "Stale-HTML manifest fallback", "Archived
      collapse vs in-flight load" and "Manifest cache key" bullets with one "Static listing" bullet: all sections are
      static; archived is hidden behind `archivedCharactersToggle`; `homeHashTarget` owns hash resolution. Include
      the shared-id rule.
    - Reword "Scroll depth" ("after all batches mount" → static count), "Search index freshness" (key is mode +
      archived visibility) and the Search UX `v` source (`data-search-index-version`, fallback endpoint).
    - Drop "Re-hydration on append" and the "full entry list" template bullet.
  - `apps/web/src/features/home/search/AGENTS.md`: drop the batch-prefetch rule.
  - Root `AGENTS.md`:
    - Home Page Architecture pointer: "Static listing, archived toggle, DOM contracts…".
    - Images: "Listing widths" loses the deferred `768/960/1280` clause.
  - `apps/web/PRODUCT.md:67-69`: remove the manifest-fallback sentence.
  - `docs/open-issues.md:65-66`: remove the two "keep" lines. Mark audit P9 resolved by this plan.
- Test: none new. The whole suite is the test.

- [ ] **Step 1: Delete and modify as listed.**
      `rg -n "home-character-batches|home-timeline-batches|home-.*-manifest|mountLegacyHome|clearHome.*Batch|batchPayloadBuilder" apps packages config docs AGENTS.md`
      must only hit dated audits/plans.
- [ ] **Step 2: Gate.**
  1. `pnpm run lint`, then `pnpm run typecheck`, then `pnpm run test`.
  2. `pnpm exec playwright test -c config/playwright.config.ts --project web`.
- [ ] **Step 3: Commit.** `refactor(web): remove deferred batch pipeline`

### Task 6: Fade images in when they finish loading

The owner wants entries to appear one by one, smoothly. Two existing pieces give most of that:

- `scrollReveal.ts`: a 500 ms reveal-up with an 80 ms stagger;
- the pulsing skeleton on `[data-commission-image]`.

The one rough edge is on slow networks. An entry slides in over its skeleton, and then the image paints over it in
one frame. This task fades the `<img>` in on `load`.

**Files:**

- Create: `apps/web/src/features/home/commission/imageFadeIn.ts` (+ `imageFadeIn.test.ts`)
- Modify:
  - `apps/web/src/styles/globals.css`: add the rules next to the `reveal-up` block.
  - `apps/web/src/features/home/commission/ProtectedCommissionImage.astro`: add `data-loaded` on the wrapper when
    `priority`.
  - `apps/web/src/features/home/homePageClient.ts` (+ test): add to `criticalMounts` next to `mountScrollReveal`.
  - `apps/web/AGENTS.md`: add an "Image fade-in" bullet to Home Page Architecture with the four rules below.

**Interfaces:**

- Produces: `mountImageFadeIn({ win?, doc? }?): () => void`. On mount it:
  1. sets `data-loaded` on every `[data-commission-image]` whose `img` is already `complete`;
  2. then sets `document.documentElement.dataset.imageFade = 'on'`;
  3. listens to `load` and `error` in the **capture** phase on `doc`, because neither event bubbles, and marks the
     target's closest `[data-commission-image]`.

  Dispose removes the listeners. It does not remove the attribute; ClientRouter's `swapRootAttributes` resets
  `<html>` attributes on every swap, and the next mount sets it again.

- CSS (exact):

  ```css
  html[data-image-fade='on'] [data-commission-image] > img {
    transition: opacity 400ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  html[data-image-fade='on'] [data-commission-image]:not([data-loaded]) > img {
    opacity: 0;
  }
  ```

  The existing global `prefers-reduced-motion` block already shortens the transition to 0.01 ms, so add no
  reduced-motion rule.

- Rules:
  - **Fail open.** Hiding applies only after JS has run and set `data-image-fade`. If JS is missing or broken, images
    show as they do today.
  - **Never fade the LCP image.** It renders with `data-loaded` from the server. Chrome does not count `opacity: 0`
    paints toward LCP, so a fade would delay LCP.
  - **No animation for cached images.** An image that is `complete` before mount is marked first, so a reload does
    not make the whole page flash.
  - **`error` counts as loaded.** A broken image must not stay invisible. Its alt text and the skeleton remain.

- [ ] **Step 1: Failing tests** (`imageFadeIn.test.ts`, jsdom). Fake `complete` with `Object.defineProperty`.
  - `marks already-complete images before enabling the fade`: after mount, `data-loaded` is on the wrapper and
    `html[data-image-fade="on"]`.
  - `marks the wrapper on a load event`: dispatch `new Event('load')` on the `img`; the wrapper gets `data-loaded`.
  - `marks the wrapper on an error event`.
  - `ignores load events from images outside a commission wrapper`.
  - `dispose stops marking`: after dispose, a `load` event leaves the wrapper without `data-loaded`.
- [ ] **Step 2: Run, expect FAIL.** `pnpm exec vitest run -c config/vitest.config.ts imageFadeIn`
- [ ] **Step 3: Implement** the module, the CSS, the `priority` attribute and the mount.
- [ ] **Step 4: Run, expect PASS.** Then lint, then typecheck, then test.
- [ ] **Step 5: Manual check with real images.** The web fixture has no image files, so Playwright cannot cover
      this.
  1. Run `pnpm run dev` with real `generated/`.
  2. Throttle to "Slow 4G" in the built-in browser.
  3. Scroll: the skeleton pulses, then the image fades in over about 400 ms, with no hard pop.
  4. Reload while scrolled: cached images show at once.
  5. The first image is never transparent.
  6. Record the result in the commit body.
- [ ] **Step 6: Commit.** `feat(web): fade commission images in on load`

### Task 7: Final gate and measurement

- [ ] **Step 1: Rebuild.** `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1 pnpm run build:web`. Then record raw / gzip / brotli
      sizes, `data-commission-entry` count and element count of `dist/index.html` next to the Evidence table. Expected:
      about 36 KB br, 278 entries (89 active + 50 archived + 139 timeline), and `find dist/search -name '*.json'`
      returning only search entries plus the version file.
- [ ] **Step 2: Lighthouse.** Run mobile Lighthouse on the `vite preview` / `astro preview` output, before (`master`)
      and after. If TBT regresses by more than 50 ms or LCP by more than 200 ms, stop and report. Do not add
      `content-visibility` without the owner (see the Ruling).
- [ ] **Step 3: Visual regression.**
  1. Run `pnpm run test:visual`.
  2. Web screenshots may change below the fold only because sections now exist. Confirm on desktop and mobile
     before `--update-snapshots`.
  3. Admin baselines must not change.
- [ ] **Step 4: Production checks after deploy.**
  - The `/admin` 404 checks from `apps/web/AGENTS.md`.
  - `curl -I https://crystallize.cc/search/home-character-manifest/en.json` returns `404`.
  - `curl -s https://crystallize.cc/search/home-search-version.json` returns `{"v":…}` with `no-cache`.
- [ ] **Step 5: Commit** the measurement into this plan's Evidence table: `docs(web): record static listing
measurements`.
