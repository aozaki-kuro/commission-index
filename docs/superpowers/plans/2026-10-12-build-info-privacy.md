# Build Label & Build-Info Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the public site leaking the commit SHA that links it to the GitHub repo, and add a footer build label that identifies a deploy without naming the repo.

**Architecture:** The public `/build-info.json` keeps its four-key shape, but `codeSha` is always `null`. The footer shows a label derived only from the fact-source snapshot meta (`revision`, `exportedAt`). Both values are already public, are not git objects, and are deterministic under the visual fixture. The formatting and shaping logic lives as pure functions in `packages/domain/src/buildInfo.ts`, so unit tests never import `@data/*`.

**Tech Stack:** Astro 7, TypeScript 6, Vitest, Playwright (cross-workspace `web` project).

**Spec:** `docs/audit-2026-10-12-full-repo.md` §0 (PRIV-1) and §6 (footer build number).

## Global Constraints

- Public output must not contain the commit SHA (full or prefix), repo URLs, or the GitHub owner name.
- Keep the `codeSha` key in `/build-info.json`. Dropping it makes admin `parseBuildInfo` (`apps/admin/src/lib/liveBuildInfo.ts:37`) throw, and publish confirmation then always times out.
- The label must not use `builtAt`, `Date.now()` or `GITHUB_RUN_NUMBER`. Web visual baselines are fixture screenshots and must stay deterministic. `CI` and `Rebuild Web` also keep separate run counters.
- The label uses the same 7-char revision prefix as admin `LiveBuildVersion` (`apps/admin/src/components/AdminSectionNav.tsx:17`), so the owner can match the footer to the admin sidebar.
- Web visual baselines are refreshed only from the fixture server, never from live data (`AGENTS.md` Configuration Layout).

## Review Focus

- An admin tab opened before the deploy reads the new JSON. `codeSha: null` must still parse, which `liveBuildInfo.test.ts` already covers. Do not change the parser.
- The label renders identically on `/`, `/ja/`, `/zh-tw/`. It is not localized.
- A revision shorter than 7 chars must not crash: `slice` handles it, and Task 1 pins this with a test.
- A non-ISO `exportedAt` must not throw. The function slices the first 10 chars and never calls `new Date()`.
- `/build-info.json` served by the fixture server must show `"codeSha":null`. Task 2 Step 2 checks it with curl.

---

### Task 1: Public build info never carries a commit SHA

**Files:**

- Modify: `packages/domain/src/buildInfo.ts`
- Modify: `packages/domain/src/index.ts` (export the new functions)
- Create: `packages/domain/src/buildInfo.test.ts`
- Modify: `apps/web/src/pages/build-info.json.ts`
- Modify: root `AGENTS.md:190` (env note), `apps/web/AGENTS.md` (gotcha), `docs/open-issues.md:29` (note that `codeSha` is now always `null`)

**Interfaces:**

- Produces: `createPublicBuildInfo(meta: { revision: string, exportedAt: string }, builtAt: string): BuildInfo`. It returns `codeSha: null`.
- Produces: `formatBuildLabel(meta: { revision: string, exportedAt: string }): string`, used in Task 2.

- [ ] **Step 1: Write the failing tests** in `packages/domain/src/buildInfo.test.ts`

```ts
const meta = {
  revision: 'b889e3a673dab13609d363168df8b30637ce5a661008e446ddbfce28053250f8',
  exportedAt: '2000-01-01T00:00:00.000Z',
}

it('never exposes a commit sha', () => {
  expect(createPublicBuildInfo(meta, '2026-10-12T00:00:00.000Z')).toEqual({
    dataRevision: meta.revision,
    dataExportedAt: meta.exportedAt,
    codeSha: null,
    builtAt: '2026-10-12T00:00:00.000Z',
  })
})

it('formats the label from revision prefix and export date', () => {
  expect(formatBuildLabel(meta)).toBe('b889e3a · 2000-01-01')
})

it('tolerates short revisions and non-ISO timestamps', () => {
  expect(formatBuildLabel({ revision: 'abc', exportedAt: 'x' })).toBe('abc · x')
})
```

- [ ] **Step 2: Run** `pnpm exec vitest run -c config/vitest.config.ts packages/domain/src/buildInfo.test.ts`. Expected: FAIL, because the exports do not exist yet.

- [ ] **Step 3: Implement both functions in `buildInfo.ts` and export them from `index.ts`**
  - `formatBuildLabel` is `` `${revision.slice(0, 7)} · ${exportedAt.slice(0, 10)}` ``.
  - Update the `BuildInfo` doc comment: `codeSha` is kept only for wire compatibility and is always `null`, because a public-repo SHA resolves to the repo via GitHub commit search.

- [ ] **Step 4: Rewrite `build-info.json.ts` to return `createPublicBuildInfo(meta, new Date().toISOString())`.** Delete the `WORKERS_CI_COMMIT_SHA` / `GITHUB_SHA` reads (Workers Builds is not used).

- [ ] **Step 5: Run the test again and confirm it passes**, then run `pnpm run typecheck`. Expected: PASS.

- [ ] **Step 6: Fix the stale env note in root `AGENTS.md`.** "Build scripts" (around `:190`) lists `GITHUB_SHA`/`WORKERS_CI_COMMIT_SHA` as build-time env. Drop them from that list. The CI shell steps in `.github/actions/deploy-web-snapshot/action.yml` still use `GITHUB_SHA` for stale-candidate checks and step summaries; that is private CI log context, so leave it unchanged.

- [ ] **Step 7: Add the gotcha to `apps/web/AGENTS.md`** under its guardrails: "Public output must not carry commit SHAs, repo URLs or the GitHub owner name. The repo is public, and GitHub commit search resolves a SHA or prefix to it." Also amend `docs/open-issues.md:29` in the same change.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/buildInfo.ts packages/domain/src/buildInfo.test.ts packages/domain/src/index.ts apps/web/src/pages/build-info.json.ts AGENTS.md apps/web/AGENTS.md docs/open-issues.md
git commit -m "fix(web): stop publishing the commit sha in build-info.json"
```

### Task 2: Footer build label

**Files:**

- Modify: `apps/web/src/features/home/blocks/Footer.astro`
- Possibly update: `test/visual/apps/web/**-darwin.png` (only the baselines whose diff is exactly the footer label)

**Interfaces:**

- Consumes: `formatBuildLabel` from `@commission-index/domain` (Task 1), and `getGeneratedFactSourceContent().meta` from `@data/generatedFactSource`. This is the same source `build-info.json.ts` uses.

- [ ] **Step 1: Render the label in `Footer.astro`.**
  - Put it inside the existing `<small>`, right after `© Crystallize`, as `<span class="ml-2 text-gray-500 dark:text-gray-400" data-build-label>{formatBuildLabel(meta)}</span>`.
  - Leave the DMCA float and the rest of the markup unchanged. The invalid-markup cleanup (BLD-5) is out of scope.

- [ ] **Step 2: Serve the fixture and check the label and the leak.**
  - Start the same server the web visual project uses: the `webServer.command` in `config/playwright.config.ts:36`, on port 4173.
  - Start it in tmux or a terminal tab. A PreToolUse hook blocks Bash commands that mention dev servers (HANDOFF gotcha).
  - Run `curl -s http://127.0.0.1:4173/ | rg -o 'data-build-label[^<]*<'`, then the same for `/ja/` and `/zh-tw/`. Expected: one match per page containing `b889e3a · 2000-01-01`.
  - Run `curl -s http://127.0.0.1:4173/build-info.json`. Expected: `"codeSha":null`.
  - Stop the server afterwards, so Step 3 does not reuse it with stale state.
  - A full `dist` leak gate belongs to the CI plan (CI-3, fixture-backed `astro build` on PRs). It is not part of this task.

- [ ] **Step 3: Check for orphan servers and run web visual.**
  - Check: `lsof -nP -iTCP:4173 -sTCP:LISTEN`. Kill any orphan it finds.
  - Run: `VISUAL_OFFLINE=1 pnpm exec playwright test -c config/playwright.config.ts --project web`.
  - Expected: PASS. Or, if it fails, every failing diff shows only the footer label change.

- [ ] **Step 4: If baselines changed, refresh them and review the images.**
  - Re-run Step 3 with `--update-snapshots`.
  - Open each changed PNG and check that only the footer differs, on both desktop and mobile snapshots.
  - Run Step 3 again and confirm it passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home/blocks/Footer.astro test/visual/apps/web
git commit -m "feat(web): show a repo-neutral build label in the footer"
```

## Out of scope (owner)

- PRIV-2: the repo is public, its source names `crystallize.cc`, and its git history carries the commit author email. Code changes cannot remove that link; only making the repo private (or a sanitized public mirror) can.
