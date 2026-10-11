# Plan: deterministic web visual fixture (R3a, 2026-10-11)

Closes the R3 deferral in `docs/open-issues.md` "Verification gaps": the web visual baselines are screenshots of live
remote data, so every data change makes them drift. After this plan, the web baselines are screenshots of a committed,
deterministic fixture, and `VISUAL_OFFLINE=1` becomes the baseline mode. There is no separate spec; the rulings below are
the authority (provisional, advisor-reviewed).

## Findings that shape the design (controller, verified)

- `createSnapshot` (`apps/admin-worker/scripts/exportWebFactSource.ts:492`) accepts commissions with no manifest entry.
  `sourceImageRegistry.ts` resolves images through the manifest only, so a commission without one renders as missing.
  **No fixture images, PNG generation, or hashing are needed.**
- Fact-source reads go through a single loader, `apps/web/data/generatedFactSource.ts` (`resolveGeneratedFactSourcePath`:
  `<cwd>/generated/fact-source/<file>`, then `<cwd>/apps/web/generated/fact-source/<file>`).
  - `apps/web/server/assetsPipelineAstro.ts` only pattern-matches `generated/...` for the dev watcher and the
    hidden-image stub.
  - `sourceImageRegistry.ts` globs `/generated/source-images`, but it resolves through the manifest.
- `apps/admin-worker/scripts/writeOfflineFactSource.ts` writes an empty fixture into `apps/web/generated/fact-source` and
  refuses to overwrite a real export. A dev checkout with real data therefore cannot run fixture mode today.
- `.github/workflows/ci.yml` carries an inline heredoc copy of that writer ("keep the two in step").

## Rulings

- R3a-1: the fixture gets its own directory, `apps/web/generated-fixture/` (git-ignored, written at server start). An env
  var `FACT_SOURCE_DIR` (absolute, or relative to `apps/web`), when set, makes `resolveGeneratedFactSourcePath` read
  only from `<dir>/fact-source/<file>`, with no fallback. Unset, behaviour is unchanged. The real `generated/` is never
  touched in fixture mode, so the overwrite guard stays only for the default path — cost if wrong: one env var to keep
  in the visual config.
- R3a-2: fixture content is committed TypeScript data, not generated from production.
  - At least 3 characters: two Active, one Archived (so the sidebar has a divider).
  - Commissions with fixed past dates, plus creator, character, and keyword aliases.
  - At least 4 featured search keywords, including one CJK keyword.
  - Names are obviously fictional (no real commissioners or characters).
  - Content is ASCII/CJK only.
  - No image files and no manifest `files` entries.
- R3a-3: the six web baselines are regenerated from the fixture after an eye check. From then on, never refresh them
  from live data. The same AGENTS change flips `VISUAL_OFFLINE=1` from smoke-only to baseline mode.
  - Should the default `test:visual` (non-offline) web project also use the fixture? Yes. The web project always
    runs against the fixture; only an explicit live-data smoke would read remote data, and none is kept.
  - So `config/playwright.config.ts` always starts the web server in fixture mode (`dev:offline` +
    `FACT_SOURCE_DIR`).
  - `VISUAL_OFFLINE` keeps one meaning: "skip the admin project" (admin needs the admin Vite server). If that is
    awkward, rename it to something clearer and update every reference.
  - Cost if wrong: no visual run touches live data anymore. That is intended: data correctness is covered by the
    export/unit tests.
- R3a-4: a stale-server guard. Before any `toHaveScreenshot`, every web spec asserts that a known fixture character name
  is visible. An orphan real-data server reused through `reuseExistingServer` then fails loudly instead of producing
  real-data screenshots.
- R3a-5: CI's inline heredoc is replaced by running the writer script with `working-directory: apps/admin-worker`
  (bare-specifier rule in `.github/AGENTS.md`).
  - Does CI's `check:astro` then use the richer fixture? Only if that is simple: the fixture dir must be readable by
    `astro check` through `FACT_SOURCE_DIR`. Otherwise, keep CI writing the fixture into `apps/web/generated/` (the
    clean CI checkout has no real data) via a writer flag, and say which in the report.
  - Cost if wrong: CI type-checks against a slightly different fixture than the visuals.
- R3b (NOT in this plan): Linux baselines and running `test:visual` in CI need the Playwright docker image to generate
  `-linux` PNGs. That is a later plan.

## Global Constraints

- Branch off up-to-date `origin/master`; one PR; rebase merge.
- Commits use `type(scope): description`, with no attribution trailers.
- Run pnpm verify commands serially. Before any Playwright run, `lsof -nP -iTCP:4173 -iTCP:4174 -sTCP:LISTEN` and stop
  orphans.
- Never run bare `test:visual:update`. Update snapshots only per title: `-g '<title>' --project web --update-snapshots`.
  Do it only after the controller has viewed the fixture screenshots.
- No remote D1/R2 command. Never delete or overwrite `apps/web/generated/` (it may hold the owner's real export).
- Grep web first-frame rendering for clock-relative output (`new Date()` / `Date.now()` without an argument) that
  would make fixture screenshots time-dependent. Fix it in the test (clock pinning via Playwright `page.clock`) if found,
  not in product code, unless it is a real bug.

## Task 1: Fixture directory, content, and loader switch

Files:

- `apps/web/data/generatedFactSource.ts` (+ its unit test)
- `apps/admin-worker/scripts/writeOfflineFactSource.ts`: accept an output dir; write content from a new committed
  fixture module, e.g. `apps/admin-worker/scripts/webVisualFixture.ts`, typed with the domain types
- `.gitignore` (`apps/web/generated-fixture/`)
- `config/playwright.config.ts`
- `apps/web/package.json`, only if a script is needed

1. Implement `FACT_SOURCE_DIR` per R3a-1, with a Vitest unit test: env set → reads only from it; unset → unchanged.
2. Add fixture content per R3a-2, then build it through `createSnapshot` so `revision` is real.
3. The writer takes the target directory from `FACT_SOURCE_DIR` (default stays `apps/web/generated`, guard kept for the
   default only).
4. `config/playwright.config.ts`: per R3a-3, the web server always runs `writeOfflineFactSource.ts` then
   `dev:offline`, with `FACT_SOURCE_DIR` pointing at the fixture dir for both commands. Keep `VISUAL_OFFLINE` as
   "web project only". Update the config comment.
5. Gates: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`. Then a `VISUAL_OFFLINE=1 pnpm run test:visual` run.
   Screenshot mismatches are EXPECTED here; record them. Every non-screenshot assertion must pass. Do not update any
   baseline.

## Task 2: Specs, stale-server guard, and CI fixture dedupe

Files:

- `apps/web/test/visual/icon-regression.spec.ts`, `search-help.spec.ts`
- `.github/workflows/ci.yml`, `.github/AGENTS.md`

1. Add the R3a-4 guard to every web spec path that takes a screenshot or asserts layout, through a shared helper.
2. Adjust any selector or wait that assumed live data (e.g. `waitForKeywordChips` must find the fixture keywords).
3. Apply R3a-5 to CI.
4. Gates: lint, typecheck, test. Run `VISUAL_OFFLINE=1 pnpm run test:visual` twice; only screenshot mismatches may fail.

## Task 3: Baselines (controller-adjudicated) and docs

1. The controller views each web actual PNG from the Task 2 run and approves the list.
2. The implementer regenerates per approved title (`-g '<title>' --project web --update-snapshots`).
3. Then the implementer runs the full `pnpm run test:visual` (web + admin) 3× and gets it green every time. `git
status` may show only the approved web PNGs.
4. Docs, in the same task:
   - Root `AGENTS.md` Configuration Layout: replace the VISUAL_OFFLINE bullet. The web visual server always uses the
     committed fixture via `FACT_SOURCE_DIR`; baselines are fixture screenshots; never refresh them from live data;
     `VISUAL_OFFLINE=1` only skips admin.
   - `docs/open-issues.md`: close R3 and add an R3b line (Linux baselines / CI) under Verification gaps.
   - `HANDOFF.md`: update the "试过什么" VISUAL_OFFLINE bullet and the web-visual risk section.
   - `apps/admin/playwright.ui.config.ts:8`: the comment still calls the `admin-*.spec.ts` specs "worker-backed";
     they are fixture-backed (`mockAdminApi`).
