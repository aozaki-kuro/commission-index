# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

> **Maintenance rule:** Update the corresponding sections of this file whenever you change architecture, conventions, or non-obvious behaviors — and sync `docs/api-reference.md` / `docs/ai-agent-guide.md` for any admin API changes. Each section that can go stale has its own **When to update** note; follow it.

## Project Overview

Commission Index — a personal commission listing/indexing site. pnpm monorepo with Astro 7 static site (public web), React 19 SPA (admin), and Cloudflare Worker (admin API). Data lives in remote D1/R2.

## Commands

```bash
# Dev
pnpm run dev              # web Astro dev (localhost:4321)
pnpm run dev:admin        # admin frontend + worker with remote D1/R2 (localhost:4174 + :8787)

# Build
pnpm run build            # build apps/web static output
pnpm run build:all        # build all workspaces via Turbo
pnpm run build:admin      # build admin only

# Validate
pnpm run lint             # ESLint check
pnpm run lint:fix         # ESLint auto-fix
pnpm run check            # Astro type-check (.astro + TS)
pnpm run typecheck        # TS check all workspaces via Turbo

# Test
pnpm run test             # Vitest unit tests (all workspaces)
pnpm run test:watch       # Vitest watch mode
pnpm run test:changed     # test changed files only
pnpm run test:visual      # Playwright visual regression
pnpm run test:visual:update  # update Playwright baselines

# Deploy (manual)
pnpm run deploy:web       # deploy public site Worker
pnpm run deploy:admin     # deploy admin Worker
```

## Architecture

### Workspace Layout

```
apps/web            Astro 7 static site — public runtime (crystallize.cc)
apps/admin          React 19 + Vite 8 SPA — admin UI (admin.crystallize.cc)
apps/admin-worker   Cloudflare Worker — admin API, D1/R2 CRUD, asset serving
packages/domain     Shared types and pure domain helpers (no app imports)
```

### Configuration Layout

- `config/` holds shared ESLint, Vitest, cross-workspace Playwright, and TypeScript base configuration.
  Root package scripts pass explicit config paths; workspace `tsconfig.json` files extend the shared base.
- `apps/admin/playwright.ui.config.ts` owns frontend-only API-fixture tests. Cross-workspace Playwright
  uses repository-root paths for servers, snapshots, and output; moving a config must preserve these roots.
- `.github/renovate.json` is the repository Renovate entry. Vite, Astro, Wrangler, and app-specific
  settings stay with their workspace; admin design context is `apps/admin/.impeccable.md`.
- Keep discovery-required package, lockfile, workspace, Turbo, mise, Git, and hook entry files at root.
  VS Code ESLint uses `config/eslint.config.ts`; other integrations must pass the same explicit path.

**When to update:** Sync scripts, editor settings, workspace extends, and this section whenever a
configuration moves. Verify test collection and snapshot paths as well as builds before committing.

### Tech Stack

- **Runtime:** Node 24 (mise) + pnpm 12 (package manager + scripts; new scripts use `.ts` not `.mjs`)
- **Build orchestration:** Turbo（Web 导出和构建暂不缓存；部署位于 Turbo 之外）
- **Public site:** Astro 7 + Tailwind CSS 4 (vanilla TS client behavior)
- **Admin frontend:** React 19 + Vite 8 + Tailwind CSS + shadcn/ui
- **Admin backend:** Cloudflare Worker + D1 (SQL) + R2 (images)
- **Testing:** Vitest + Playwright (visual regression)
- **Lint:** @antfu/eslint-config — single quotes, no semicolons, trailing commas, width 100

### Data Flow

1. Admin writes explicit commission ID/date/creator metadata to remote D1 and immutable source-image objects to R2 via `apps/admin-worker`; commission dates/authors are not encoded in new internal asset keys
2. `exportWebFactSource.ts` 只读导出 D1/R2 -> `apps/web/generated/*`，不回写生产 metadata；单个 D1 SELECT 读取结构化快照，下载图片必须匹配该快照的 hash/size；每条作品必须有 `source_images` 行，缺失即中止导出
3. content 与 source-image manifest 的 `meta.revision` 共同标识内容版本，排除 `exportedAt`；Astro 从这份固定输入生成 HTML，无运行时 D1/R2 访问
4. `apps/web/wrangler.jsonc` carries read-only D1/R2 bindings for build-time export

### Home Page Architecture (Astro-first)

Static markup is Astro templates. All client-side behavior uses Astro script components (`HomeClientScript.astro`) and vanilla TS modules — no React on the client.

Key patterns:

- **Deferred sections:** Active/stale character sections and timeline use inline manifest + external batch JSON, lazy-loaded via script loaders
- **Batch URL versioning:** Each batch file gets its own `?v=<hash>` from per-batch content hashing (djb2 of the serialized commission data in that batch). Editing one commission only invalidates the batch containing it, not all batches. The manifests also carry a global `v` (hash of all commissions) used by the search entries URL (`/search/home-search-entries.json`) in the search controller. Hash inputs include full commission content (fileName, Links, Description, Design, Keyword) — so both structural and metadata changes produce new versions. Key files: `homeCharacterBatches.ts`, `homeTimelineBatches.ts`, `commissionSearchController.ts`.
- **DOM contracts:** `data-*` attributes drive search/nav/hash navigation — preserve attribute names when editing templates
- **`data-stale-visibility`** = stale group expanded; **`data-stale-loaded`** = deferred stale sections mounted
- Character/stale section templates must mount with full entry list intact (no per-section entry lazy mounts above anchor targets)
- **Stale-HTML manifest fallback:** When hash navigation fails because the inline manifest (embedded in cached HTML) doesn't contain the target, the loaders fetch a standalone manifest endpoint (`/search/home-character-manifest.json` or `/search/home-timeline-manifest.json`) with cache-busting. The fresh manifest's `targetBatchById` and `batchVersions` are threaded through the batch fetch so that new entries added after the HTML was cached can still be navigated to. The standalone manifests use `Cache-Control: no-cache` and are only fetched on the fallback path — zero overhead for the happy case.
- **Re-hydration on append:** Deferred batch DOM appended after initial mount must trigger re-hydration / re-binding of interactive controls — a single first-paint hydrate pass is not enough
- **Hidden DOM + observers:** Sections rendered with `display: none` must not be marked "entered viewport" by reveal/lazy observers while hidden; toggling visibility must re-scan
- **Scroll stability:** Never lazy-load content above an anchor target on the navigation path — browser scroll restoration and lazy injection fight each other. If above-anchor height cannot be fully fixed, keep the lazy load off the nav critical path
- **Search index freshness:** Search rebuild after batch mount must include batch mount count (or structural change counter) in its snapshot key, not just a `visible/loaded` boolean — otherwise newly injected DOM briefly shows unfiltered

**When to update this section:** Any change to the deferred loading system requires updating the bullet points above — specifically:

- Adding/removing fields from `HomeCharacterBatchManifest` or `HomeTimelineBatchManifest`
- Changing how `v` is computed (hash inputs, algorithm)
- Changing which URL builder appends `?v=` or how search entries derive their version
- Changing the `_headers` cache policy for `/search/*` or `/*.html`
- Adding new deferred JSON endpoints or batch types

### Admin Architecture

- Admin UI: `apps/admin`; admin API: `apps/admin-worker`
- Worker owns all CRUD: character, commission, aliases, suggestions, source images
- Production auth: Cloudflare Zero Trust (no worker-side auth)
- Worker fails fast when D1/R2 bindings are missing
- Admin Overview 以管理入口、概况、发布和最近作品分区，连接诊断按需展开；Suggestion 将显示顺序与词池并列，Aliases 保留跨 tab 草稿，Keyword 批量替换使用独立 Dialog 预览。页面通知与待发布操作共用浮动通知栈，不能分别定位造成重叠。具体状态边界见 `apps/admin/AGENTS.md`。

### Path Aliases (apps/web)

`#layouts/*`, `#features/*`, `#components/*`, `#images/*`, `#data/*`, `#lib/*`, `#styles/*`, `#config/*`, `#admin/*`

## API Documentation

Two reference docs live in `docs/`:

| File                     | Purpose                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `docs/api-reference.md`  | Complete endpoint reference — method, path, request/response types, `curl` examples                   |
| `docs/ai-agent-guide.md` | Integration guide — implicit behaviors, serialization quirks, retry strategy, normalization, pitfalls |

**When to read:** Before calling or modifying any `/api/admin/*` endpoint, read `docs/api-reference.md` for the contract and `docs/ai-agent-guide.md` for non-obvious behaviors (links encoding, alias batch semantics, retry rules, etc.).

**When to update:** Keep both docs in sync whenever:

- A new endpoint is added or removed in `apps/admin-worker/src/adminApi.ts` or `adminData.ts`
- Request/response shapes change (field names, types, required/optional status)
- Implicit behaviors change (normalization logic, R2 lifecycle, error codes)
- New serialization quirks or footguns are discovered

Update `AGENTS.md` at the same time for any architecture-level change. **This is the agent's responsibility** — don't wait for the user to remind you. After any endpoint, schema, or behavior change, update the relevant docs in the same session.

### Lessons Learned

When you discover a non-obvious bug, footgun, or architecture-specific gotcha during development, add it to the relevant section of this file (not a separate lessons file). Only record insights that would prevent a future mistake — not one-time fixes or migration-era workarounds. If the lesson fits an existing guardrail section, merge it there; otherwise add it under the closest heading.

## Validation Gates

### Unit Test Scope

- Vitest 使用根配置收集各 workspace 的 `*.test.ts(x)`，默认 Node；需要 DOM 的测试按文件声明 `@vitest-environment jsdom`，不设置全局 cwd 或加载 matcher 扩展。
- 保留领域规则、API 输入/输出、数据守恒/回滚和异步竞态测试；不以源码字符串、Tailwind 拼写或当前生产数据中的特定记录代替行为断言。
- Worker API/persistence 共用 `apps/admin-worker/test/sqliteD1.ts` 执行真实 SQL 与事务回滚；R2 保留边界 mock。不要用 SQL 字符串匹配再实现一套数据库。
- 异步 DOM 测试使用 `vi.waitFor` 等待可观察结果，不以固定次数的 Promise/timer 循环猜测完成时间；真实布局、滚动和动画交给 Playwright。

### Local Hooks (enforced by prek)

**Pre-commit:**

1. `pnpm install --frozen-lockfile` — lockfile integrity
2. `lint-staged` — ESLint fix on staged files

**Pre-push:**

1. `pnpm run lint` — full ESLint check
2. `pnpm run typecheck` — TypeScript across all workspaces
3. `pnpm run test` — Vitest unit tests

### CI（PR 校验；master 发布）

1. PR/master 执行 lint、全 workspace typecheck、单测
2. 生成无生产凭证的离线 fixture，执行 Astro check 和 admin build
3. master 部署依赖上述门禁；Web 获得共享环境锁后只导出一次，记录 SHA/revision
4. Astro check 与 Wrangler custom build 使用相同快照；部署前核对当前 master SHA，过期候选跳过

CI gotchas:

- CI Web 与 rebuild 使用相同 job concurrency group `release-web-production`；在锁内导出新数据，避免旧队列项携带旧数据快照覆盖新发布。Admin 使用独立环境锁
- required checks 的 GitHub 仓库设置需要另行核验，工作流文件本身不代表线上分支保护已启用
- Tests that depend on `apps/web/generated/*` must guard imports behind existence checks (lazy import, not top-level) — CI may run before export
- 内联脚本（`node --input-type=module` / heredoc / `-e`）的裸模块说明符从 cwd 解析；根 `package.json` 不依赖任何 workspace 包，pnpm 也不会把它们链接到根 `node_modules`，因此导入 `@commission-index/*` 的内联脚本必须设 `working-directory` 到声明了该依赖的包（如 `apps/admin-worker`）

## Guardrails

### Astro 7

- Keep `i18n.routing.redirectToDefaultLocale` explicit
- Keep `apps/web/src/content.config.ts` present even when empty (suppresses dev warning)
- Do not enable CSP (Shiki inline styles conflict; analytics needs `https://sight.crystallize.cc`)
- Astro and admin both use Vite 8/Rolldown; keep production bundler customization under `build.rolldownOptions` and verify Tailwind plugins with `astro check` + real build
- Keep TypeScript on 6.x until both `@astrojs/check` and `typescript-eslint` publish TypeScript 7-compatible peer ranges; never bypass this mismatch with peer overrides

### Dependency Boundaries

- `apps/web` imports from `packages/*` only — never from `apps/admin` or `apps/admin-worker`
- `packages/domain` is app-agnostic — never imports from `apps/*`
- Admin features go in `apps/admin` + `apps/admin-worker`, not `apps/web`
- Keep pnpm workspace policy lint-clean: retain `minimumReleaseAgeExcludePrune: true` and the
  canonical key order/blank lines; target workspaces with `pnpm -C <dir> run <script>`, not the
  pnpm 11-incompatible `pnpm run --cwd <dir> <script>` form
- pnpm 12 records the pinned package manager as a separate first YAML document in
  `pnpm-lock.yaml`; keep that document when updating the lockfile and verify with a repeated
  `pnpm install --frozen-lockfile`

### Cloudflare Deploy

- No repo-root `wrangler.jsonc` — each Worker owns its own config
- Workers Builds connects same repo to two Workers with different root dirs (`apps/web` and `apps/admin-worker`)
- Web export/build 暂设 `cache: false`，防止 Turbo 恢复旧 generated 或在导出前计算过期输入 hash；恢复缓存前必须验证显式 snapshot 构建契约
- 发布只导出一次，将 `meta.revision` 传入 `WEB_BUILD_CACHE_TOKEN`，并设置 `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1`；后续 export 依赖仅校验两份 revision 和本地图片 hash，不再访问远端
- 不预先 build:web；Wrangler custom build 是正式构建入口。工作流允许显式导出和 Astro check，二者必须绑定上述固定快照
- Turbo `envMode: "strict"`: credentials set in outer workflow don't auto-propagate into task subprocesses — add `CLOUDFLARE_API_TOKEN` etc. to `passThroughEnv` explicitly

#### Production `/admin` verification

Production deployment is static-only (no Worker entrypoint). `/admin` and `/api/admin/*` must return 404 — enforced via `assets.not_found_handling = "404-page"`. `apps/web/public/_redirects` currently contains only public-site redirects (/commission, /feed.xml, /rss); admin path blocking relies on the Workers asset handler's 404 behavior. Verify after deploy:

```bash
curl -I https://<your-domain>/admin
curl -I https://<your-domain>/admin/aliases
curl -I https://<your-domain>/api/admin/bootstrap
```

All three should return `404`. Note: `vite preview` does not validate edge HTTP status behavior for static host routing.

### Search UX

- Search UI must be layout-stable on first paint — no shell-to-content swaps
- Production search index: `/search/home-search-entries.json` (not DOM metadata)
- Search locale labels resolve from `homeSearchControls.ts` (not the full `homeLocale` graph)

### Images

- Source images: `apps/web/generated/source-images/*.{jpg,jpeg,png}`
- 新上传的 R2 `objectKey` 唯一规范为 `source-images/<sha256>-<UUIDv4>.jpg|png`：保留分类前缀，不含作品名目录，相同字节每次上传仍有独立 UUID。读取把 D1 `source_images.object_key` 当作不透明身份，兼容历史根 key、作品目录 key 和扁平 key，不按文件名探测桶根；`commissions.file_name` 仍作内部资产键并保留校验/持久化。日期/作者只能从显式字段读取，本地 `relativePath` 以该内部键映射，不能把远端 key 当成本地路径
- 源图 key 迁移与旧对象清理已完成（2026-10-03）：R2 仅保留 141 个被 D1 引用的扁平对象，287 个旧根文件/作品目录对象已按用户授权删除。一次性迁移 CLI 已从仓库移除，工具副本、计划与原图备份保存在 `.backups/`（不入库）；恢复旧布局必须先从本地备份重新上传对应对象，再更新 D1，不能直接回滚旧映射。新代码不再按旧布局推测 key
- Resolution: `sourceImageRegistry.ts` maps the internal commission asset key to the generated image stem; user-visible identity and search never parse that key
- Listing widths: `768/960/1280`, sizes `(max-width: 768px) 92vw, 640px`

### 数据库迁移验证

- 表重建必须验证带数据升级：父表 `DROP TABLE` 可触发子表 `ON DELETE CASCADE`，`defer_foreign_keys` 只延迟检查，不阻止级联动作。空库迁移通过与 `foreign_key_check` 为空均不证明业务数据守恒。
- 迁移前后核对稳定 ID 集、逐行内容摘要、父子关系、索引和自增序列；先确认线上已应用版本，不重跑历史迁移。D1 恢复方案须同时覆盖 R2 对象保留及已读取旧 metadata 的在途导出。

## 审计文档索引

```text
docs/
  audit-2026-09-29.md             代码与设计审计证据、风险和验证边界
  improvement-plan-2026-09-29.md  对应问题的分阶段整改与验收计划
  database-optimization-assessment-2026-09-29.md  数据库优化必要性、模型取舍、迁移风险、工作量与验收计划
  admin-ui-stability-plan-2026-09-29.md  Create/Edit 漂移审计、模拟浏览器证据、状态设计与分阶段验收
  admin-design-audit-2026-09-30.md  全后台设计审计、编辑台布局、功能保留矩阵与验收证据
  admin-hidpi-review-2026-09-30.md  Vercel 风格配色、适量毛玻璃、HiDPI 密度与对比度证据
  admin-consistency-review-2026-09-30.md  角色状态语义、统一页面边界与连续切页验收
```

审计报告记录指定提交的状态，不是运行时依赖；改进计划依赖报告中的问题编号。2026-09-29 新增上述文档，未变更业务架构。后续整改应更新计划进度，并同步实际变更涉及的架构/API 文档。

过期实施计划不作为当前架构依据：已移除三月至五月的迁移 roadmap、旧 Superpowers 计划/规格、后台迁移占位页及未接线的资产生成链；当前约束以分层 AGENTS、API 文档和上述审计/整改记录为准。公开搜索 JSON 与 RSS 由 Astro 路由生成，更新摘要直接从固定构建输入推导，不能恢复向 `src/` 写入生成模块的旧路径。清理须核对源码和配置引用，保留生产备份、数据库迁移历史及仍使用的测试基线。

Admin 布局稳定性规划覆盖加载外壳、后台刷新、表单反馈、网格占位与滚动恢复；浏览器证据来自本地模拟 API，不代表生产回归。验收必须检查状态切换过程中的元素位置与焦点，稳定终态截图不能证明中间过程无漂移。

2026-09-30 Admin 设计改为桌面侧栏与五页统一 1600px 外壳，移动端保留完整导航；采用 Vercel 风格黑白灰，毛玻璃限于导航、吸附保存条和通知，正文实底。标题、分隔线和主表面跨路由保持边界，图片/字段列在内部调整。首页主辅分栏，Create 固定比例图片预览，Edit 提供跨尺寸键盘排序与 2–5 列自适应图卡，角色状态只标记例外：Active 不显示标记，Archived 名称降为灰色并在名称后显示 IconArchiveFilled（role=img、aria-label、title），不只依赖颜色——分界位置 + sr-only 文本提供语义，长名截断时图标保持可见，归档表示公站默认折叠。Aliases 顶部保存工具栏，Suggestion 序号排序与词池。HiDPI 按 CSS 视口与 DPR 分开验收。API/schema/裁剪契约不变，具体边界见 `apps/admin/AGENTS.md`。

Admin 整改现采用页面/模态各自的浮动通知，禁止常驻空状态槽；保留既有交互动效，角色选择在加载前后保留中性占位。短 UUID 使用 7 位，缩略卡放链接数量同行，弹窗放头部角色信息行，各只显示一次。模块边界见 `apps/admin/AGENTS.md`；`apps/admin/playwright.ui.config.ts` 是不启动 Worker 的 fixture 专用入口，使用 `pnpm run test:admin-ui`。

数据库专项评估补充既有 `docs/db-r2-identity-migration-plan-and-prompts-2026-09-29.md` 的交接预案；实施前须阅读专项评估中的带数据迁移风险、R2 上传身份和恢复闸门。schema v3 在内部整数键之外增加每条作品不可变随机 `public_id`，并以独立 group UUID 与正整数 part 编号显式表示分篇；R2 对象键和图片关联仍不变。应用 0005 前必须导出当前生产 D1 备份、核验完整迁移历史并回放旧数据，随后按 Worker/Admin/Web 顺序发布并检查公开端点与所有作品/图片计数。

## Commit Convention

```
type(scope): short imperative summary (lowercase, <72 chars)
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `build`, `ci`, `revert`, `data`

## Dev Ports

| App                          | Port |
| ---------------------------- | ---- |
| apps/web (Astro)             | 4321 |
| apps/admin (Vite)            | 4174 |
| apps/admin-worker (Wrangler) | 8787 |
