# 未决事项

仍未关闭的问题清单，最后核对于 2026-10-09。每条动手前须重新对照代码核实；行号会漂移。

## Web

- **搜索聚焦仍预取全部 active 批次**：`commissionSearchController.ts:269-306` 聚焦即 `prefetchHomeCharacterBatches` 到最后一批（`batchRequestQueue.ts` 已限并发 4，但请求总数仍随角色数增长）。收口：只预取首批或固定窗口，先测聚焦到首结果的请求数与耗时。
- **web 内残留 domain 的分叉副本**：`apps/web/src/lib/search/commissionSearchMetadata.ts`、`apps/web/src/lib/commissions/timeline.ts` 仍被 `homeCharacterBatchPayload.ts`、`buildSitePayload.ts` 等引用；domain 版 DOM key 用 `fileName`，web 版用 `publicId`。收口：先确认公站 DOM 依赖哪个键，再让 web 改用 `@commission-index/domain` 并删副本。
- **`packages/domain/src/search.ts`（约 25 KB）无测试**：同目录仅别名、文件名、日期、时间线、元数据有测试。收口：补前缀匹配、and/or/否定、缓存淘汰用例。
- **软导航后客户端岛失效（P1-P3）**：半成品修法（`softNavMount.ts`）已于 2026-10-09 删除，bug 本身仍在；`CommissionSearchIsland.astro:464`、`AgeGateScript.astro:259`、`CommissionImageNoticeScript.astro:47` 仍是一次性挂载 + `pagehide`。见 `audit-2026-10-05-web-architecture.md` WS1。
- **图片模糊回退可能挂错图（P4）**：`sourceImageRegistry.ts:139-166` `resolveStemByFallback` 仍在，`resolveSourceImageStem` 仍调用它。见同文档 WS2。

## Admin

- **裁剪器随编辑/创建表单静态加载**：`AddCommissionForm.tsx:16`、`CommissionEditForm.tsx:34` 静态 import `ImageCropDialog`。收口：改动态 import，验证未选图时无 Cropper 块请求。
- **未验证（LOGIC-02）**：保存后列表、搜索行、已展开明细是否同版本，以及跨标签刷新是否只失效相关角色，未逐路径核对（`CommissionManager.tsx`、`AdminEditPage.tsx`）。收口：补"本标签改关键词后搜新词立即命中"的测试。

## Worker + Data

- **概览仍有热路径 schema 探测（PERF-02）**：`adminData.ts:365-379` 的 `hasTable`、`hasCommissionKeywordColumn` 在 `:423,462,553,728,751` 每次请求执行。迁移 0001-0005 已齐，收口：确认线上已应用后删探测，并记录 SQL 条数。
- **换图后立即删除旧 R2 对象**：`adminApi.ts:~474` 在 D1 提交后删旧 key，已读到旧元数据的在途导出会 not-found/hash mismatch 而中止（不发布错图，只需重跑）。收口：延迟回收或导出读取失败时重取元数据。
- **R2 孤儿只留警告**：清理失败仅 `console.warn`（`adminApi.ts` 换图分支），无重试队列或回收器。收口：离线清点脚本或定时回收，删除前对照 D1 `source_images.object_key`。
- 未验证：生产等价的隔离 D1/R2 并发创建；R2 get/put/cleanup 各阶段故障注入。原因：需要 Cloudflare 运行时，本地 SQLite + R2 mock 不构成证明。

## CI + Release

- **发布管线两份手工副本**：`ci.yml` 的 web job 与 `rebuild.yml` 都实现 导出 → revision → astro check → 部署 → dist 哈希。收口：抽 `workflow_call` 或复合 action，不改互斥与过期候选语义。
- **CI 不缓存源图片（PERF-06）**：`.github/actions/setup/action.yml` 只缓存 pnpm store，两个 workflow 均无图片缓存，增量复用无法跨运行。收口：仅缓存图片输入、仍按 D1 hash/size 校验；缓存体积大于下载成本则放弃。
- **发布结果无反馈（P6）**：`websiteRebuild.ts` 收到 204 即 `clearPendingRebuild`；半成品 `build-info.json.ts` 已删除，后台侧也未做。见 WS4。
- **`scripts/devAdminRemote.ts:151`** 仅检查 worker 端口，未检查 4174；失败日志不区分崩溃与启动中。

## Verification gaps

- **Playwright 配置**：`config/playwright.config.ts` 单视口 1440×1600、无 `deviceScaleFactor`；`apps/admin/playwright.ui.config.ts:7` `testMatch` 为显式文件列表，新增 spec 不自动纳入。web 项目的 dev webServer 经 `fact-source:sync-images` 依赖远端 D1/R2，缺离线 fixture 模式（P10）。
- 未验证：读屏、320/390/768/1440 视口、200% 文字缩放、reduced motion 的完整验收；首屏体积、搜索响应等性能基线。原因：需人工或浏览器实测，仓库内无记录。
- 未验证：真实 GitHub push/rebuild 并发下的最终 Worker revision。原因：需线上运行。

## 仍需 owner 决定

- **未来日期规则（P1-5）**：`adminPersistence.ts:153-160` 与 `adminApi.ts:245-257` 只校验日历合法，`2999-12-31` 可通过。选项：全部拒绝，或"不晚于当前 + N 天"（预售）。
- **branch protection（P11）**：master 的 required checks 需在 GitHub 设置中开启，仓库内无法核验。
- **删除 R2 旧文件名回退探测**：保留，直到生产 D1 查询确认 `source_images` 无 `commission_id IS NULL` 遗留行。

## 10-05 web 审计

P1-P11 与 WS1-WS5 的证据、修法和文件所有权见 `audit-2026-10-05-web-architecture.md`。P7（AGENTS.md manifest 路径）已于 2026-10-09 修正。

## 已核实不是缺陷

- D1 `batch()` 是事务，失败整体回滚；`adminPersistence.ts` 的 `runStatementsAtomically` 正确，不要按"非事务"改写入路径。
- 全局 vitest `setupFiles` 不存在；`apps/web/test/setup.tsx` 已删除。
- `mountLegacyHome*Batch` 是 manifest 缺失时的生产回退，且有测试，保留。
- `clearHome*BatchRequestCacheForTests` 是测试专用导出，保留。
- `fuse.js` 按需加载（`vendor-search` 分块）是有意设计，不要改静态导入。
- `/admin`、`/api/admin/*` 的 404 仅由 `assets.not_found_handling = "404-page"` 保证，`_redirects` 无 admin 条目，文档已一致。
- 作者别名大小写敏感是有意契约，`aliasNormalization.test.ts` 已断言。
