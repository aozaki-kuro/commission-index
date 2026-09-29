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

### Tech Stack

- **Runtime:** Node 24 (mise) + pnpm 12 (package manager + scripts; new scripts use `.ts` not `.mjs`)
- **Build orchestration:** Turbo（Web 导出和构建暂不缓存；部署位于 Turbo 之外）
- **Public site:** Astro 7 + Tailwind CSS 4 (vanilla TS client behavior)
- **Admin frontend:** React 19 + Vite 8 + Tailwind CSS + shadcn/ui
- **Admin backend:** Cloudflare Worker + D1 (SQL) + R2 (images)
- **Testing:** Vitest + Playwright (visual regression)
- **Lint:** @antfu/eslint-config — single quotes, no semicolons, trailing commas, width 100

### Data Flow

1. Admin writes to remote D1/R2 via `apps/admin-worker`
2. `exportWebFactSource.ts` 只读导出 D1/R2 -> `apps/web/generated/*`，不回写生产 metadata；单个 D1 SELECT 读取结构化快照，下载图片必须匹配该快照的 hash/size
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

Production deployment is static-only (no Worker entrypoint). `/admin` and `/api/admin/*` must return 404 — enforced via `assets.not_found_handling = "404-page"` and explicit mappings in `apps/web/public/_redirects`. Verify after deploy:

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
- R2 `objectKey` 是不可变对象身份，可含目录；本地 `relativePath` 固定为 `source-images/<commissionFileName>.<ext>`。导出复用与清理根据本地 canonical 名称处理，不能把远端 key 当作本地路径
- Resolution: `sourceImageRegistry.ts` — commission `fileName` stem must match source image stem
- Listing widths: `768/960/1280`, sizes `(max-width: 768px) 92vw, 640px`

## 审计文档索引

```text
docs/
  audit-2026-09-29.md             代码与设计审计证据、风险和验证边界
  improvement-plan-2026-09-29.md  对应问题的分阶段整改与验收计划
```

审计报告记录指定提交的状态，不是运行时依赖；改进计划依赖报告中的问题编号。2026-09-29 新增上述文档，未变更业务架构。后续整改应更新计划进度，并同步实际变更涉及的架构/API 文档。

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
