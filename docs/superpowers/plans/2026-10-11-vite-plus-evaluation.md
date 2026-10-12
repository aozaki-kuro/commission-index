# Vite+ Adoption Evaluation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide, with evidence from a throwaway worktree, whether any part of this repo should move to Vite+ (`vite-plus@1.1.0`), and record the ruling.

**Architecture:** This is not a migration plan. Research (2026-10-11) shows that a "full migration" is not possible today. The plan is
one spike with a decision gate (Task 1), plus a standalone oxlint trial that does not depend on Vite+ (Task 2). Each runs in its own
worktree (`spike/vite-plus`, `spike/oxlint`), and neither merges to master. Task 3 writes the ruling into the docs and is the only change that lands.

**Tech Stack:** pnpm 12.11.2, mise (Node 24), Astro 7.3.x (vite ^8.3.1), Vite 8 admin SPA, Vitest 5.0.3, ESLint 10 +
`@antfu/eslint-config` 9.5.1, prek, `vite-plus@1.1.0` (bundles vite 8.3.3, vitest 5.0.3, oxlint 1.87.0, oxfmt =0.72.0,
oxlint-tsgolint 7.0.2003).

**Spec:** this conversation's request: check Astro/Vite+ compatibility, decide how to handle the pnpm/mise conflict, and estimate migration cost. The
evidence and rulings below are the spec.

## Findings (evidence, 2026-10-11)

### Astro ↔ Vite+

| Fact                                                                                                                                                                                                                                        | Source                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `vp dev` / `vp build` run the bundled Vite CLI. In an Astro project, dev returns 404 for every URL and build fails on a missing `index.html`                                                                                                | vite-plus #2456 (open), #1506 (open)     |
| The only supported path is `vp run dev` / `vpr dev`, which just runs the `astro` script. Vite+ adds nothing to the Astro build itself                                                                                                       | same                                     |
| Vite+ requires a `vite.config.ts`, and Astro config cannot act as Vite+ config                                                                                                                                                              | #912 (closed without fix), #1506         |
| Migration aliases `vite` → `npm:@voidzero-dev/vite-plus-core` via a **workspace-wide** pnpm override, so Astro would run on the fork (bundled vite 8.3.3, which satisfies Astro's `^8.3.1`). Runtime behavior under Astro is **unverified** | viteplus.dev/guide/local-cli; `npm view` |
| oxlint parses `.astro` frontmatter/`<script>` only. It has no template rules (no equivalent of `eslint-plugin-astro`)                                                                                                                       | oxc #22090/#22091/#21954                 |
| oxfmt Astro support merged 2026-10-08 (oxc #27386). oxfmt 0.72.0 shipped 2026-10-05, and vite-plus 1.1.0 pins `oxfmt =0.72.0`, so **`.astro` formatting is not available in Vite+ yet**                                                     | npm `time`, PR merge date                |

### TS 7

`oxlint-tsgolint` runs type-aware lint on native tsgo, so type-aware **linting** can use TS 7 now. It does **not** let
`package.json` move to `typescript@7`: `@astrojs/check` (peer `^5 || ^6`) and `typescript-eslint` (peer `<6.1.0`) still
block that, and Astro's `.astro` checking still needs `@astrojs/check`. The AGENTS.md "Keep TypeScript on 6.x" rule stands.

### pnpm / mise ruling

| Mode                                                               | Effect                                                                                                                                | Ruling                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project-local `vite-plus` devDependency, invoked as `pnpm exec vp` | binary in `node_modules/.bin`, no shims, no PATH change                                                                               | **OK**: the only allowed mode                                                                                                                     |
| Global `vp` install + `vp env setup` / managed mode                | writes `~/.vite-plus/env` sourced from shell rc files, and shims `node`/`pnpm`                                                        | **Forbidden**: it edits shell config (violates the user rules) and has a known shim loop with mise (#2728, fixed 09-21; the class of bug remains) |
| `vp install`                                                       | delegates to the declared package manager                                                                                             | not used; keep `pnpm`                                                                                                                             |
| `vp migrate`                                                       | rewrites lint-staged, deletes the ESLint config, and historically pinned `devEngines.packageManager` (#2816, fixed 10-06; #2037 open) | run **only** in the spike worktree, and read its diff without adopting it                                                                         |

mise keeps owning Node (`.mise.toml`), `packageManager: pnpm@12.11.2` keeps owning pnpm, and prek keeps owning hooks.

### Migration cost (estimates are guesses, marked ~)

| Line                                                 | Effort                                                           | Gain                         | Loss / risk                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin build (`vite` → `vp build`)                    | ~0.5 d                                                           | ≈ 0 (same Vite 8 underneath) | fork alias                                                                                                                                                                                                                                                                             |
| Tests (`vitest` → `vp test`)                         | ~0.5 d (merge `config/vitest.config.ts` into a `vite.config.ts`) | ≈ 0 (same vitest 5.0.3)      | config-path conventions in AGENTS.md                                                                                                                                                                                                                                                   |
| Web (Astro)                                          | n/a: `vp dev/build` refused                                      | 0                            | Astro runs on the forked vite if the override is global                                                                                                                                                                                                                                |
| Lint + format (ESLint/antfu/prettier → oxlint/oxfmt) | ~2–3 d + full-repo reformat diff                                 | speed; tsgo type-aware lint  | loses `perfectionist`, `antfu`, **`pnpm`** (it guards the `pnpm-workspace.yaml` policy rule in AGENTS.md), `jsonc`/`yml`/`toml`, `@eslint/markdown`, `.astro` template rules, and css/html/markdown formatters; `.astro` formatting (26 files) unavailable until vite-plus bumps oxfmt |
| Workflow files                                       | ~0.5 d                                                           | n/a                          | `package.json` scripts, `lint-staged`, `.pre-commit-config.yaml`, `.github/workflows/ci.yml`, `.vscode/`, AGENTS.md                                                                                                                                                                    |

Favourable: 0 `eslint-disable` comments in the repo, so there is no directive rewrite.

## Global Constraints

- Never install `vp` globally, run `vp env *`, or edit shell rc files. Invoke Vite+ only as `pnpm exec vp`.
- Keep `.mise.toml` (`node = "24"`), `"packageManager": "pnpm@12.11.2"`, and prek unchanged.
- Spike work happens only in the worktrees `../commission-index-vp-spike` (`spike/vite-plus`) and
  `../commission-index-ox-spike` (`spike/oxlint`). Never merge either.
- Pin exact versions: `vite-plus@1.1.0`, `@voidzero-dev/vite-plus-core@1.1.0`, `vitest@5.0.3`.
- No remote D1/R2 access. Web verification uses `FACT_SOURCE_DIR=generated-fixture` (written by
  `apps/admin-worker/scripts/writeOfflineFactSource.ts`), as `config/playwright.config.ts` does.
- Run pnpm commands sequentially (AGENTS.md: parallel runs race on `node_modules/.pnpm`).
- Keep `typescript@^6.0.3`.

## Review Focus

- The override silently leaks to Astro. Even a scoped override can change the `vite` that Astro resolves through hoisting or the `@tailwindcss/vite` peer.
  Expected: Task 1 Step 4 records which `vite` each of `apps/web` and `apps/admin` resolves to.
- `vp` writes outside the repo on first run (`~/.vite-plus`, rc files). Expected: Task 1 Step 3 snapshots `$HOME` dotfiles before and after.
- oxlint's "0 errors" on `.astro` gets read as coverage. Expected: Task 2 reports `.astro` coverage as frontmatter-only,
  and lists the ESLint rules with no oxlint equivalent.
- Type-aware oxlint reports diagnostics that ESLint never saw (tsgo vs TS 6 differences). Expected: Task 2 classifies them as
  real/false-positive instead of counting them as regressions.
- The decision gets lost. Expected: Task 3 writes the ruling and re-evaluation triggers into AGENTS.md and `docs/open-issues.md`.

---

### Task 1: Vite+ spike in an isolated worktree

**Files:**

- Modify (worktree only): `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/admin/package.json`
- Create (worktree only): `docs/superpowers/plans/2026-10-11-vite-plus-spike-report.md`

**Interfaces:**

- Produces: the spike report with gate verdict `G1 = PASS | FAIL` and one line per check below. Task 3 reads it.

- [ ] **Step 1: Create the worktree and record a baseline**

```bash
git worktree add -b spike/vite-plus ../commission-index-vp-spike master
```

In the worktree, run sequentially and record exit code plus duration for each:
`pnpm install --frozen-lockfile`; `pnpm run test`; `pnpm run typecheck`; `pnpm -C apps/admin build`;
`FACT_SOURCE_DIR=generated-fixture node --import tsx apps/admin-worker/scripts/writeOfflineFactSource.ts`, then
`FACT_SOURCE_DIR=generated-fixture pnpm -C apps/web build`; `pnpm -C apps/web exec astro check .`;
`VISUAL_OFFLINE=1 pnpm run test:visual`. Expected: all green. If the offline web build is not green at baseline, stop
and record that; the spike cannot judge Astro without a green baseline.

- [ ] **Step 2: Variant A (scoped alias). Add Vite+ for admin only**

`pnpm add -D -w vite-plus@1.1.0`. In `pnpm-workspace.yaml` add:

```yaml
overrides:
  '@commission-index/admin>vite': npm:@voidzero-dev/vite-plus-core@1.1.0
  vitest: 5.0.3
```

Change the `apps/admin` scripts `vite …` to `vp dev …` / `vp build` / `vp preview …`, keeping the same host and port flags.

- [ ] **Step 3: Verify that nothing is written outside the repo**

Before the first `vp` call, save to the session scratchpad: whether `~/.vite-plus`, `~/.local/share/vite-plus` and
`~/.config/vite-plus` exist, plus `stat -f '%m %N' ~/.zshrc ~/.zshenv ~/.config/fish/config.fish`. Run `pnpm exec vp --version`,
then capture the same listing again and diff the two. Expected: no new directories and no changed rc mtimes. Any write → `G1 = FAIL`.

- [ ] **Step 4: Record vite resolution per workspace**

`pnpm -C apps/web list vite --depth 0` and `pnpm -C apps/admin list vite --depth 0`, plus `pnpm why vite`. Expected for variant A:
web → `vite 8.3.x` (upstream), admin → `@voidzero-dev/vite-plus-core 1.1.0`. If web resolves to the fork, record "scoped override
leaks".

- [ ] **Step 5: Re-run the Step 1 commands plus `pnpm -C apps/admin exec vp build` and `pnpm run test:admin-ui`**

Expected: same exit codes as baseline, `apps/admin/dist` file list identical in names (hashes may differ), and visual tests green.

- [ ] **Step 6: Variant B (global alias, as `vp migrate` would do)**

Replace the scoped key with `vite: npm:@voidzero-dev/vite-plus-core@1.1.0`, run `pnpm install`, and re-run the web steps from Step 1
(offline build, `astro check`, `VISUAL_OFFLINE=1 pnpm run test:visual`). Expected: record pass/fail per command. Any failure
means Astro cannot coexist with the documented setup.

- [ ] **Step 7: Read-only `vp migrate` diff**

On a scratch commit, run `pnpm exec vp migrate --no-interactive`, save `git diff --stat` and the `package.json`/lint-staged hunks
into the report, then `git reset --hard HEAD` (worktree only). Expected: a list of what it would delete or rewrite. Nothing is kept.

- [ ] **Step 8: Write the report and gate**

`G1 = PASS` only if Steps 3, 5 and 6 are all green. Commit the report on `spike/vite-plus`:

```bash
git add docs/superpowers/plans/2026-10-11-vite-plus-spike-report.md
git commit -m "docs(spike): record vite-plus compatibility results"
```

### Task 2: Standalone oxlint + tsgolint trial (independent of Vite+)

**Files:**

- Create (worktree only): `config/oxlintrc.json`, `docs/superpowers/plans/2026-10-11-oxlint-trial-report.md`
- Modify (worktree only): `package.json` (devDependencies `oxlint@1.87.0`, `oxlint-tsgolint@7.0.2003`; script `"lint:ox"`)

**Interfaces:**

- Consumes: nothing from Task 1. It runs in its own worktree so Vite+ overrides cannot affect the result.
- Produces: the trial report with gate verdict `G2 = PASS | FAIL`.

- [ ] **Step 1: Create the worktree and capture the ESLint baseline**

`git worktree add -b spike/oxlint ../commission-index-ox-spike master`, then `pnpm install --frozen-lockfile`, then
`pnpm exec eslint . --config config/eslint.config.ts -f json -o <scratchpad>/eslint.json`. Expected: 0 problems (the repo is
`--max-warnings=0` clean).

- [ ] **Step 2: Add oxlint with the plugin set closest to the antfu config**

Use the plugins `typescript, unicorn, import, jsdoc, node, regexp, vitest, react, jsx-a11y`, with `react`/`jsx-a11y` scoped to
`apps/admin/**` through `overrides`. Script: `"lint:ox": "oxlint -c config/oxlintrc.json --type-aware --max-warnings=0"`. Check the flag
names against `pnpm exec oxlint --help` before relying on them.

- [ ] **Step 3: Run it and classify every diagnostic**

`pnpm run lint:ox` with JSON output written to the scratchpad. For each diagnostic, record rule, file, and real / false-positive / style-only.
Expected: a table in the report. Also record wall time against Step 1.

- [ ] **Step 4: Write the rule-gap table**

List each antfu-enabled plugin with no oxlint equivalent (`perfectionist`, `antfu`, `pnpm`, `jsonc`, `yml`, `toml`, `@eslint/markdown`,
`astro` template rules, `format`/prettier css-html-markdown). For each, note the AGENTS.md rule it currently enforces, if any.

- [ ] **Step 5: Gate and commit**

`G2 = PASS` if no false positives remain unresolved and the run is faster than ESLint. Commit the report on `spike/oxlint`
(`docs(spike): record oxlint trial results`).

### Task 3: Record the ruling (lands on master via PR)

**Files:**

- Modify: `AGENTS.md` (Guardrails → Dependencies / pnpm, next to the "Keep TypeScript on 6.x" rule)
- Modify: `docs/open-issues.md`

**Interfaces:**

- Consumes: `G1`, `G2` and the report from Tasks 1–2.

- [ ] **Step 1: Write the AGENTS.md ruling (≤4 lines)**

Content depends on the gates:

- Always: "Vite+ cannot drive Astro (`vp dev/build` unsupported, vite-plus #1506). Never install `vp` globally or enable `vp env`;
  mise owns Node and `packageManager` owns pnpm. Type-aware oxlint (tsgo) does not unblock `typescript@7`."
- If `G2 = PASS`: "oxlint may run alongside ESLint as `lint:ox`; ESLint stays the gate until the rule gaps listed in
  `docs/open-issues.md` are covered."

- [ ] **Step 2: Add re-evaluation triggers to `docs/open-issues.md`**

One entry: re-run this plan when (a) vite-plus ships oxfmt ≥ the release containing oxc #27386, (b) #1506 lands Astro integration,
or (c) `typescript-eslint` / `@astrojs/check` allow TS 7. Link the spike report on its branch.

- [ ] **Step 3: Validate and commit**

Run `pnpm run lint`. Expected: 0 warnings (this covers `AGENTS.md`; `docs/**` is in the ESLint ignores).

```bash
git add AGENTS.md docs/open-issues.md
git commit -m "docs: record vite-plus evaluation ruling"
```

Remove both worktrees (`../commission-index-vp-spike`, `../commission-index-ox-spike`) only after the user has read the reports.
