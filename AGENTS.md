# AGENTS.md

Guidance for coding agents working in this repository. Nested `AGENTS.md` files add per-directory rules;
each directory's `CLAUDE.md` is only `@AGENTS.md`.

> **Maintenance rule:** in the same change, update this file (and any nested `AGENTS.md`) when you change
> architecture, configuration layout, the deferred-loading contract, or a non-obvious behavior; update
> `docs/api-reference.md` / `docs/ai-agent-guide.md` when any `/api/admin/*` contract or implicit behavior
> changes. Record a new gotcha in the closest section here — no separate lessons/todo files. Only record what
> would prevent a future mistake; no history narration or one-off fixes.

## Project Overview

Commission Index — a personal commission listing/indexing site. pnpm monorepo with an Astro 7 static site
(public web), a React 19 SPA (admin), and a Cloudflare Worker (admin API). Data lives in remote D1/R2.

## Commands

```bash
# Dev
pnpm run dev              # web Astro dev (localhost:4321); alias dev:web
pnpm run dev:admin        # worker with remote D1/R2 (:8787), then admin Vite (:4174) once the API answers

# Build
pnpm run build            # build apps/web (fact-source export, then astro build)
pnpm run build:all        # build web and admin workspaces

# Validate
pnpm run lint             # ESLint (also lints Markdown), --max-warnings=0
pnpm run check            # Astro type-check; exports fact-source first (remote D1/R2 read)
# offline: pnpm -C apps/web exec astro check .  (uses the existing apps/web/generated/)
pnpm run typecheck        # TS check all workspaces (pnpm -r)

# Test
pnpm run test             # Vitest unit tests (all workspaces)
pnpm run test:visual      # cross-workspace Playwright visual regression
pnpm run test:admin-ui    # Playwright, admin frontend only (API fixtures, no Worker)

# Data (remote, read-only on production metadata)
pnpm run web:fact-source:export       # D1/R2 -> apps/web/generated/*
pnpm run web:fact-source:sync-images  # fetch source images missing locally per manifest
```

Never run pnpm commands that verify/relink dependencies in parallel in the same checkout (install, lint,
typecheck, test, build): they race on `node_modules/.pnpm` and produce fake `.bin` ENOENT / `workerd`
errors. Run them sequentially.

## Architecture

### Workspace Layout

```
apps/web            Astro 7 static site — public runtime (crystallize.cc)
apps/admin          React 19 + Vite 8 SPA — admin UI (admin.crystallize.cc)
apps/admin-worker   Cloudflare Worker — admin API, D1/R2 CRUD, asset serving
packages/domain     Shared types and pure domain helpers; single export surface src/index.ts
scripts/            Repo-level dev scripts (devAdminRemote.ts backs dev:admin; not covered by `typecheck`;
                    its `adminPort` must match apps/admin/package.json `dev`)
test/visual/        Committed cross-workspace Playwright baselines
```

Dependency boundaries: `apps/web` imports from `packages/*` only; `packages/domain` is runtime-light pure
logic and never imports from `apps/*`; `apps/admin` reaches data only through `apps/admin-worker`.
Admin features go in `apps/admin` + `apps/admin-worker`, never `apps/web`.

### Configuration Layout

- `config/` holds shared ESLint, Vitest, cross-workspace Playwright, and TypeScript base configuration.
  Root scripts pass explicit config paths; workspace `tsconfig.json` files extend the shared base.
  VS Code ESLint uses `config/eslint.config.ts`; other integrations must pass the same explicit path.
- `apps/admin/playwright.ui.config.ts` owns frontend-only API-fixture tests and matches `*.spec.ts` while
  excluding the `admin-*.spec.ts` screenshot specs owned by cross-workspace Playwright.
- `VISUAL_OFFLINE=1 pnpm run test:visual` writes an empty generated fact-source fixture and runs only web visual
  specs, without D1/R2 access. It is a server-start/smoke mode only: committed baselines are real-data screenshots,
  so fixture runs fail screenshot assertions; never update baselines from it. The default cross-workspace visual run
  still starts the remote-bound admin worker.
  Cross-workspace Playwright uses repository-root paths for servers, snapshots, and output; moving a config must
  preserve these roots.
- `.github/renovate.json` is the Renovate entry. Vite, Astro, Wrangler, and app-specific settings stay with
  their workspace; admin design context is `apps/admin/.impeccable.md`.
- Keep discovery-required package, lockfile, workspace, mise, Git, and hook entry files at root.
- When moving a config, verify test collection and snapshot paths as well as builds.

### Tech Stack

- **Runtime:** Node 24 (mise) + pnpm 12 (new scripts use `.ts`, not `.mjs`, and must be type-checked)
- **Public site:** Astro 7 + Tailwind CSS 4 (vanilla TS client behavior, no React on the client)

### Data Flow

1. Admin writes explicit commission ID/date/creator metadata to remote D1 and immutable source-image objects
   to R2 via `apps/admin-worker`; dates/authors are never encoded in new internal asset keys
2. `exportWebFactSource.ts` 只读导出 D1/R2 -> `apps/web/generated/*`，不回写生产 metadata；单个 D1 SELECT
   读取结构化快照，下载图片必须匹配该快照的 hash/size；每条作品必须有 `source_images` 行，缺失即中止导出
3. content 与 source-image manifest 的 `meta.revision` 共同标识内容版本，排除 `exportedAt`；Astro 从这份固定
   输入生成 HTML，无运行时 D1/R2 访问
4. `exportedAt` 在 D1 快照读取之前采样（不参与 `revision`），因此 admin 能拒绝一份早于发布请求读取的快照
5. `apps/web/wrangler.jsonc` carries read-only D1/R2 bindings for build-time export

### Home Page Architecture

Deferred loading, content-hashed batch files, stale-HTML fallback, DOM contracts and the soft-navigation
lifecycle are specified in `apps/web/AGENTS.md`; read it before touching the home page or its `/search/*` output.

### Admin Architecture

- Worker owns all CRUD: character, commission, aliases, suggestions, source images
- Production auth: Cloudflare Zero Trust (no worker-side auth)
- `.mcp.json` registers the official shadcn MCP against `apps/admin/components.json` (registry lookup only). Admin uses relative imports and has no `@/*` tsconfig alias, so do not run `shadcn add` blindly — generated imports would not resolve

### Path Aliases (apps/web)

Defined in `apps/web/tsconfig.json` and mirrored in `config/vitest.config.ts` — keep both in sync.

## API Documentation

- `docs/api-reference.md` — endpoint contract (method, path, request/response, status codes, `curl`)
- `docs/ai-agent-guide.md` — implicit behaviors, serialization quirks, retry strategy, footguns

Read both before calling or modifying any `/api/admin/*` endpoint (in `apps/admin-worker/src/adminApi.ts`,
`adminData.ts`).

## Validation Gates

### Unit Test Scope

- Vitest 使用根配置收集各 workspace 的 `*.test.ts(x)`，默认 Node；需要 DOM 的测试按文件声明
  `@vitest-environment jsdom`，不设置全局 cwd 或加载 matcher 扩展。
- 保留领域规则、API 输入/输出、数据守恒/回滚和异步竞态测试；不以源码字符串、Tailwind 拼写或当前生产数据中的
  特定记录代替行为断言。不保留尺寸×主题×数量的截图笛卡尔积，同一规则的多个用例合并。
- Worker API/persistence 共用 `apps/admin-worker/test/sqliteD1.ts` 执行真实 SQL 与事务回滚；R2 保留边界 mock。
  不要用 SQL 字符串匹配再实现一套数据库。
- 异步 DOM 测试使用 `vi.waitFor` 等待可观察结果，不以固定次数的 Promise/timer 循环猜测完成时间；真实布局、
  滚动和动画交给 Playwright。
- Tests depending on `apps/web/generated/*` must guard behind an existence check and lazy import — CI may
  collect tests before export.
- Visual baselines live under `test/visual/`; never replace them with `playwright-report/` or `test-results/`
  output. Confirm visual deltas on both desktop and mobile before updating snapshots.

### Local Hooks (prek)

- **Pre-commit:** `pnpm install --frozen-lockfile`, then `lint-staged` (ESLint fix on staged files)
- **Pre-push:** `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`

Never put a tracked file that lint-staged rewrites under a whole-directory ignore rule — the hook's re-stage
fails on ignored paths. Anchor ignore rules (e.g. `/.impeccable/` at root; `apps/*/.impeccable/` is tracked).

### CI（PR 校验；master 发布）

Pipeline order, release concurrency locks, the `deploy-web-snapshot` composite action and CI cache rules live in
`.github/AGENTS.md`; read it before editing anything under `.github/`.

## Guardrails

### Astro 7 / Vite

- Astro-specific guardrails (i18n routing, `content.config.ts`, CSP) live in `apps/web/AGENTS.md`
- Astro and admin both use Vite 8/Rolldown; keep production bundler customization under
  `build.rolldownOptions` and verify Tailwind plugins with `astro check` + a real build

### Dependencies / pnpm

- Before "upgrade all to latest", check peer ranges of framework checkers, parsers, and the lint toolchain;
  upgrade in stages and pin back only packages with a real peer conflict or failing gate
- Keep TypeScript on 6.x until both `@astrojs/check` and `typescript-eslint` publish TypeScript 7-compatible
  peer ranges; never bypass the mismatch with peer overrides
- Keep pnpm workspace policy lint-clean: retain `minimumReleaseAgeExcludePrune: true` and the canonical key
  order/blank lines; target workspaces with `pnpm -C <dir> run <script>`, not
  `pnpm run --cwd <dir> <script>` (pnpm 11+ incompatible)
- pnpm 12 records the pinned package manager as a separate first YAML document in `pnpm-lock.yaml`; keep it
  when updating the lockfile and verify with a repeated `pnpm install --frozen-lockfile`

### Build scripts

- Root build/check scripts are plain pnpm (no task runner). The web build and `check` first run apps/web's
  `fact-source:export`, which points the export at the read-only web bindings via
  `FACT_SOURCE_WRANGLER_CONFIG=../web/wrangler.jsonc`; that order must be preserved. The pinned release build
  reuses the snapshot via `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1`. `typecheck` is `pnpm -r run typecheck` (bails
  on the first workspace failure; parallel is safe because each runs only `tsc`).
- Because these are plain pnpm scripts, environment variables (`CLOUDFLARE_API_TOKEN`, `FACT_SOURCE_USE_EXISTING_SNAPSHOT`,
  `GITHUB_SHA`/`WORKERS_CI_COMMIT_SHA`) are inherited by child processes; no pass-through allowlist is needed.
- A prerequisite owned by one workspace (e.g. apps/web's `fact-source:export`) must stay wired into the script
  that needs it, not hoisted into a shared recursive task.

### Cloudflare Deploy

- No repo-root `wrangler.jsonc` — each Worker owns its config. GitHub Actions CI is the only deploy path;
  Cloudflare Workers Builds is not used, and Workers receive only the final built artifact (root dirs
  `apps/web` and `apps/admin-worker` exist for local/Wrangler use, not for a Builds connection)
- Call the repo-local `node_modules/.bin/wrangler`; extra runner wrappers have broken `d1 execute --command`
  argument parsing in Cloudflare Builds
- 发布只导出一次，将 `meta.revision` 传入 `WEB_BUILD_CACHE_TOKEN`，并设置 `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1`；
  后续 export 依赖仅校验两份 revision 和本地图片 hash，不再访问远端
- 不预先 build:web；Wrangler custom build 是正式构建入口。工作流允许显式导出和 Astro check，二者必须绑定上述
  固定快照
- The public deployment is static-only: `/admin` and `/api/admin/*` must return 404 in production (post-deploy
  check in `apps/web/AGENTS.md`)

### Search matching

- Home search UX rules live in `apps/web/AGENTS.md`; the matcher itself is `packages/domain/src/search.ts`
- JS `\b` is ASCII-only: never wrap user search terms in `\b…\b`; strict matching adds a boundary only on
  sides with an ASCII word char, so CJK/kana terms match as substrings.

### Images

- Source images: `apps/web/generated/source-images/*.{jpg,jpeg,png}`
- 新上传的 R2 `objectKey` 唯一规范为 `source-images/<sha256>-<UUIDv4>.jpg|png`：不含作品名目录，相同字节每次上传
  仍有独立 UUID。读取把 D1 `source_images.object_key` 当作不透明身份，不按文件名探测桶根；`commissions.file_name`
  仍作内部资产键并保留校验/持久化。日期/作者只能从显式字段读取，本地 `relativePath` 以该内部键映射，不能把远端 key
  当成本地路径
- 旧 R2 布局（根 key / 作品目录 key）已清除且**不可回滚**；新代码不得按旧布局推测 key
- `sourceImageRegistry.ts` resolves a commission's image by integer `id` through the generated manifest only (exact
  match, no filename/stem fallback); a missing image renders as missing. User-visible identity and search never parse
  `fileName`
- Listing widths: inline `<img>` and LCP preload `768/1280` (width 1280); deferred batch images `768/960/1280`; sizes `(max-width: 768px) 92vw, 640px`
- The registry resolves images only for visible commissions: `Hidden: true` originals are kept out of the module graph by the `hidden-source-image-stub` Vite plugin in `apps/web/server/assetsPipelineAstro.ts`. Astro emits every image that enters the graph and deletes originals only after `getImage`, so an eager glob would otherwise ship hidden originals in `dist/_astro/`.

### 数据库迁移验证

- 无查询需求不拆表：keyword 暂留在 `commissions` 列中；不引入 EAV 或通用 `owner_type/owner_id` 表。
- 不要在有数据的 D1 上盲目 `migrations apply`；`migrations list` 不能代替检查远端真实 schema。远端命令不属于
  本地验证。
- 表重建必须验证带数据升级：父表 `DROP TABLE` 可触发子表 `ON DELETE CASCADE`，`defer_foreign_keys` 只延迟检查，
  不阻止级联动作。空库迁移通过与 `foreign_key_check` 为空均不证明业务数据守恒。
- 迁移前后核对稳定 ID 集、逐行内容摘要、父子关系、索引和自增序列；先确认线上已应用版本，不重跑历史迁移。D1 恢复
  不会恢复 R2，恢复方案须同时覆盖 R2 对象保留及已读取旧 metadata 的在途导出。

## docs/ Index

Current constraints come from the layered `AGENTS.md` files and the API docs. Dated audits are evidence at a
commit, not instructions.

- `api-reference.md`, `ai-agent-guide.md` — admin API contract and integration pitfalls
- `open-issues.md` — verified open backlog and "verified not a defect" list; re-verify before acting
- `audit-2026-10-05-web-architecture.md` — web architecture decision (keep static Astro, no SSR) and the
  WS1–WS5 work packages; fold into `open-issues.md` once they land

## Commit Convention

```
type(scope): short imperative summary (lowercase, <72 chars)
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `build`, `ci`, `revert`, `data`
