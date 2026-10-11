# 未决事项

仍未关闭的问题清单，最后核对于 2026-10-11。每条动手前须重新对照代码核实；行号会漂移。

## 已于 2026-10-11 收口

- **LOGIC-02 跨标签过度拉取**：广播可携带 `characterIds`（`dataUpdateSignal.ts`），Edit 页只重取受影响的已加载角色；无 scope（别名、角色增删改排序、关键词批量、storage 回退、旧标签、无排队请求的首次载入）保持全量重取。过期标签的 scope 可能漏掉他处移入的角色组，该组在下次全量刷新时更新。
- **web 内残留别名逻辑副本**：已删除 `apps/web/src/lib/{characterAliases,creatorAliases,keywordAliases}.ts`（与 domain 同名文件仅注释语言不同），web 现统一从 `@commission-index/domain` 导入。
- **admin 视觉回归 31 个失败（根因：spec 过期，非环境问题）**：specs 落后于 `2939c7e`（publicId）、`d734944` / `10fd8ad`（标题与壳宽）、`89797f2`（重建确认），且跑在错误的 Playwright 配置下。修复：`be84ee5` / `c7f12a9` 改为 `mockAdminApi` fixture 驱动，cross-workspace 仅匹配 `admin-*.spec.ts`；`0aea395` 修旋转时读到 0x0 选区的竞态；`7a1f2af` 截图前等数据就绪；`f9189db` 刷新 7 张 admin 基线；`0493590` 裁剪器在容器 resize 时重适配，直到用户首次编辑。结果：`pnpm run test:visual` 42/42（admin 31 + web 11），`pnpm run test:admin-ui` 28/28。
- **web 视觉基线随远端数据漂移（R3）**：web 视觉服务现固定读取已提交的 fixture（`apps/web/generated-fixture/`，`FACT_SOURCE_DIR`），基线为 fixture 截图，不再随远端数据漂移；spec 以 `expectFixtureData` 防止复用到真实数据的孤儿服务。`VISUAL_OFFLINE=1` 现仅表示跳过 admin。

## 已于 2026-10-09 收口

已修并随分支验证的项，不再单列：

- **软导航后客户端岛失效（P1-P3）**：`225944b` 新增 `apps/web/src/lib/astro/softNavMount.ts`，搜索岛 / 年龄门 / 图片提示改走 `astro:page-load`（挂载）+ `astro:before-swap`（清理），保留搜索岛的延迟挂载并在 teardown 取消未触发的 idle 回调。浏览器实测：软导航到 `/ja/` 后建议仍为 8/8/8（修复前掉到 0）。
- **图片模糊回退可能挂错图（P4）**：`fce98b7` 删除 `resolveStemByFallback`，`sourceImageRegistry.ts` 只按 `byCommissionId` 精确解析（缺图即缺图）。
- **`packages/domain/src/search.ts` 无测试**：`2a6d471` 补 `search.test.ts`。
- **搜索聚焦预取全部 active 批次**：`ba32f3b` 改为只预取下一批（`commissionSearchController.ts` + `commissionSearchFocusPrefetch.test.ts`）。
- **web 内残留 domain 的分叉副本**：`5594868` + `359f7b1` 删除 `lib/search/commissionSearchMetadata.ts`、`lib/commissions/timeline.ts`，改用 `@commission-index/domain`。
- **裁剪器静态加载**：`44fae25` 改动态 import（`LazyImageCropDialog.tsx`，独立 ImageCropDialog 分块）。
- **`dev:admin` 只检查 worker 端口**：`2596bfe` `scripts/devAdminRemote.ts` 现在检查 4174，并区分崩溃与启动中。
- **`packages/domain/src/commissionFileName.ts` 死代码**：`f93db2a` 删除。
- **未来日期可写入**：`2909399` 一律拒绝未来日期（owner 决定）。
- **LOGIC-02 半关闭**：`7074abb` 修掉“刷新后晚到的保存结果被丢弃”（`CommissionManager.tsx`）；跨标签过度拉取已于 2026-10-11 收口。
- **locale 列表分散（P8）**：`5810884` 收敛到 `apps/web/src/config/locales.ts`。
- **CI 两份手工副本 + 源图片不缓存（PERF-06）**：`2d0a753` 抽 `deploy-web-snapshot` 复合动作 + 源图片缓存（仅能真实 Actions 运行验证，见下）。
- **P7 AGENTS.md manifest 路径**：`0843d1c` 修正。
- **发布结果无反馈（P6 / WS4）**：`b3e8f5d` 构建产出 `apps/web/src/pages/build-info.json.ts`（`dataRevision` / `dataExportedAt` / `codeSha` / `builtAt`），`_headers` 对该文件 no-cache + admin 源 CORS；worker rebuild 返回 `dispatchedAt`；后台 `liveBuildInfo.ts` 的 `isBuildConfirmed` 带 30 s 时钟容差，`websiteRebuild.ts` 轮询约 10 分钟（退避 5→30 s），超时报 unconfirmed，侧栏显示 `LiveBuildVersion`。
- **换图/在途导出竞争（P5 / WS3）**：R2 删除 commit（`chore/handoff-closeout`）让导出器遇 R2 `not_found` 时重读一次 D1 再重试，关闭「换图已提交 D1、旧对象刚删」的窗口；hash/size 不匹配仍立即失败。
- **角色级联删除不清 R2（WS3）**：同一 commit 让 `DELETE /characters/:id` 在 D1 批提交后，按 `commission_id` / `commission_file_name` 选出该角色的 object_key，只删无存活行引用的 key（1000 个一批，无 `IMAGES` binding 返回 503，R2 失败仅 `console.warn` 仍返回 200）；漏删的孤儿由 `r2:list-orphans` 脚本按 D1 差集回收。
- **R2 孤儿只留警告**：新增离线 `apps/admin-worker/scripts/listR2Orphans.ts` + 脚本 `r2:list-orphans`（默认 dry-run，`--delete` 才删，走 Cloudflare REST API）；尚未对生产运行。

## Worker + Data

- **概览热路径 schema 探测（PERF-02，待生产核验）**：`adminData.ts:365-379` 的 `hasTable`、`hasCommissionKeywordColumn` 在 `:423,462,553,728,751` 每次请求执行。删除提案在**未合并**分支 `perf/admin-worker-drop-schema-probes`（commit `e410e3d`）；合并前须 owner 在只读生产 D1 上核验 schema（命令见 `HANDOFF.md`），不得盲目合并。
- **未验证：R2 故障注入 / 真实运行时**：生产等价的隔离 D1/R2 并发创建；R2 get/put/cleanup 各阶段故障注入。原因：需要 Cloudflare 运行时，本地 SQLite + R2 mock 不构成证明。换图在途导出 `not_found` 的修复、角色删除清 R2 均已落地（R2 删除 commit on `chore/handoff-closeout`），但仍缺真实运行时验证。

## CI + Release

- **CI 复合动作 / 缓存只能真实运行验证**：`2d0a753` 的 `deploy-web-snapshot` 复合动作与源图片缓存，其并发锁覆盖、过期候选跳过、缓存命中语义只在实际 GitHub Actions 运行中成立，仓库内无法证明。

## Verification gaps

- **Playwright 仍单视口**：`config/playwright.config.ts` 单视口 1440×1600、无 `deviceScaleFactor`，未加移动端 project（admin `playwright.ui.config.ts` 的 `testMatch` 已改为 `*.spec.ts` + `testIgnore: 'admin-*.spec.ts'`）。
- 未验证：读屏、320/390/768/1440 视口、200% 文字缩放、reduced motion 的完整验收；首屏体积、搜索响应等性能基线。原因：需人工或浏览器实测，仓库内无记录。
- 未验证：真实 GitHub push/rebuild 并发下的最终 Worker revision。原因：需线上运行。
- **R3b：Linux 基线与 CI 视觉回归**：目前只有 `-darwin` 基线，CI 不跑 `test:visual`。补 `-linux` 基线并在 CI 运行 `test:visual` 需要 Playwright docker 镜像（保证字体与渲染一致）。

## 仍需 owner 决定 / 操作

- **未来日期规则（P1-5）**：已决定一律拒绝未来日期（`2909399`）。**待 owner 确认**：实现按 UTC+14（最晚时区）比较，属实现者假设，非 owner 认可；现有未来日期行在任何 PATCH 前都会失败，编辑表单预填未做客户端校验。
- **branch protection（P11）**：master 的 required checks 需在 GitHub 设置中开启，仓库内无法核验。
- **删除 R2 旧文件名回退探测**：保留，直到生产 D1 查询确认 `source_images` 无遗留行：`SELECT count(*) FROM source_images WHERE commission_id IS NULL` 应为 0。
- **R2 孤儿清点脚本首次运行**：离线脚本 `pnpm -C apps/admin-worker run r2:list-orphans`（默认 dry-run，`--delete` 才删；agent 不得运行）。owner 先在 dry-run 结果里挑一个 key 验证，再考虑 `--delete`。

## 10-05 web 审计

P1-P11 与 WS1-WS5 的状态见 `audit-2026-10-05-web-architecture.md`。WS1-WS5 均已落地（WS4 `b3e8f5d`；WS3 见 R2 删除 commit `chore/handoff-closeout`），剩余开放项已并入本文件。

## 已核实不是缺陷

- D1 `batch()` 是事务，失败整体回滚；`adminPersistence.ts` 的 `runStatementsAtomically` 正确，不要按“非事务”改写入路径。
- 全局 vitest `setupFiles` 不存在；`apps/web/test/setup.tsx` 已删除。
- `mountLegacyHome*Batch` 是 manifest 缺失时的生产回退，且有测试，保留。
- `clearHome*BatchRequestCacheForTests` 是测试专用导出，保留。
- `fuse.js` 按需加载（`vendor-search` 分块）是有意设计，不要改静态导入。
- `/admin`、`/api/admin/*` 的 404 仅由 `assets.not_found_handling = "404-page"` 保证，`_redirects` 无 admin 条目，文档已一致。
- 作者别名大小写敏感是有意契约，`aliasNormalization.test.ts` 已断言。
