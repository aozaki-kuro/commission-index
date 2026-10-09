# 主站 web 架构评估与修复计划（2026-10-05）

## 结论

**保留 Astro 静态快照架构，不做框架迁移、不改 SSR。** 当前约 141 条作品、发布 2–3 分钟，
瓶颈在导出与校验，不在渲染层；没有任何已发现问题需要靠 SSR 或换框架才能解决。

问题集中在两个真实缺口：**客户端岛在软导航下的生命周期**、**发布结果无反馈**；
以及一处模糊匹配带来的潜在挂错图风险。这些都可以局部修掉。

评估为只读进行：没有修改代码、没有远端导出、没有部署、没有跑完整本地构建。
未测项在文末列出。

---

## 一、数据流与一致性（核对结论）

```
D1/R2 ──exportWebFactSource.ts──> generated/*.json + source-images ──> Astro static ──> Workers Static Assets
                     ▲
        admin 保存只写 D1/R2 ──> POST /api/admin/rebuild ──> repository_dispatch ──> rebuild.yml
```

- `apps/web/astro.config.ts:7` — `output: 'static'`，公开站运行时不读 D1/R2。**正确。**
- 导出为单条聚合读取 + 图片 hash/大小校验，失败即中止发布，不写新快照。**正确。**
- revision 排除 `exportedAt`，同数据不同时间导出得到同一 revision。**正确。**
- 发布工作流带 `release-web-production` 并发锁 + 候选 SHA 校验。**正确。**

即：现有显式发布模型是成立的，不需要改成运行时读取。

---

## 二、问题清单

### P1 · 已确认 · 搜索在软导航后失效（高）

**证据**：`apps/web/src/layouts/BaseLayout.astro:128` 挂载 `<ClientRouter />`；
`apps/web/src/features/home/search/CommissionSearchIsland.astro:406-419` 用一次性
`requestIdleCallback` 挂载，`commissionSearchController.ts:872-888` 返回的 cleanup 从未被调用。

**复现**：本地构建上，直接打开 en / ja 首页搜索正常（8 条建议）；经语言链接切换后建议为 0、
结果区为空，`window` 状态仍在 → 确认走软导航。

**根因**：ClientRouter 软导航**不触发 `pagehide`**，只触发 `astro:page-load` /
`astro:before-swap`；而打包后的模块脚本**只执行一次**。因此在模块顶层做 DOM 查询 /
一次性挂载的岛，软导航后拿不到新 DOM、也不会重新挂载。

**修法**：统一到 `astro:page-load`（挂载）+ `astro:before-swap`（清理）生命周期，
参考已正确实现的 `apps/web/src/features/home/HomeClientScript.astro:1-23`。
搜索岛是延迟挂载（`requestIdleCallback`）以保首屏，修复时必须**保留延迟**，并在 teardown
时取消尚未触发的 idle 回调，否则导航到一半挂载进已死 DOM。

### P2 · 潜在 · 年龄门同模式（中）

`apps/web/src/features/home/warning/AgeGateScript.astro:122-273`：模块顶层查 DOM +
`pagehide` 清理。软导航后新页面的遮罩拿不到按钮监听、`syncOpenState()` 不再运行，
可能出现遮罩栏死或状态与 localStorage 不同步。**本次未做浏览器复现**，判为同类根因。

### P3 · 潜在 · 图片提示同模式（低）

`apps/web/src/features/home/commission/CommissionImageNoticeScript.astro`：顶层绑定
`contextmenu` + `pagehide` 清理，`noticeCleanup` 挂载到被换掉的 DOM。

### P4 · 潜在 · 图片模糊回退可能挂错图（中）

`apps/web/src/lib/images/sourceImageRegistry.ts:139-166` 的
`resolveStemByFallback` 在精确文件名缺失时按「归一化 → 日期前缀 → 作者子串」猜，
可能命中别的作者/作品。`sourceImageRegistry.test.ts:37` 正把
`20260226_ナナシ → 20260226_七市` 锁成预期行为。

调用点：`apps/web/src/features/home/commission/CommissionEntries.astro:61`、
`apps/web/src/features/home/server/batchPayloadBuilder.ts:29`、
`apps/web/src/features/home/pages/HomePage.astro:91,110`（缺图检查 + 首图）。

**当前未发现生产错误**——导出器保证精确名称；但这条回退与
`apps/web/AGENTS.md`「never parse `fileName`… as a record identity」的护栏相冲突，
属于「静默错误」类风险。`byCommissionId`（`sourceImageRegistry.ts:112-120`）已经建立且基本闲置，
`Commission.id: number` 现成（`packages/domain/src/content.ts:2`）。

**修法**：改走 `byCommissionId`，删除猜测回退。

### P5 · 潜在 · 换图与在途导出的竞争（中）

`apps/admin-worker/src/adminApi.ts:457-481`：换图写新 D1 元数据后**立即删除旧 R2 对象**。
已经读到旧元数据的在途导出随后下载旧 key，会 not-found / hash mismatch 而中止发布
（当前导出窗口约 50 秒可碰到）。**不会发布错图**，但需要重新 Rebuild，而 P6 又让人不知道发生了什么。

### P6 · 已存在 · 发布结果无反馈（中）

`apps/admin-worker/src/adminApi.ts:752-781` 只等 GitHub 204；
`apps/admin/src/lib/websiteRebuild.ts:54` 收到即 `clearPendingRebuild`；
待发布状态只存在每标签页的 `sessionStorage`。工作流失败或 SHA 过期跳过部署后，
后台仍显示“Publishing continues in the background.”，**你无法确认线上是否真的更新**。

**修法**：构建时产出 `build-info.json`（`codeSha` / `dataRevision` / `builtAt`）到 dist，
后台拉取线上该文件与本地待发布 revision 比对，**确认上线后才清 pending**，并显示线上版本。

### P7 · 已存在 · 文档路径写错（低）

根 `AGENTS.md` 把 manifest 写成 `/search/home-character-manifest.json`，
实际是 `/search/home-character-manifest/<locale>.json`（`_headers` 侧写法正确）。

### P8 · 结构 · locale 列表分散（低）

`en` / `zh-tw` / `ja` 在 astro 配置、i18n 消息、路由、`_headers` 多处重复，新增语言容易漏改。

### P9 · 结构 · 双渲染器重复（低，本次不做）

`apps/web/src/features/home/commission/batch/batchRender.ts:4-20` 用 TS 常量复制了
`CommissionEntries.astro` 的 Tailwind class 与 `data-*` 契约，两处独立演化会漂移。
等条目 markup 下次变动时再收敛，现在动收益低、回归风险高。

### P10 · 基建 · Playwright 启动依赖远端资源（中，本次不做）

`config/playwright.config.ts:44-66` 的 webServer 跑 `apps/web dev`，其 prehook 会
`fact-source:sync-images`（需远端 D1/R2）。CI 里缺 fixture 离线模式，视觉回归不可靠。

### P11 · 运维 · master 无 branch protection（中，需你操作）

GitHub API 返回 404 Branch not protected；质量检查已有但未强制合并。

---

## 三、修复计划（工作流拆分）

并行 = 文件所有权互斥；文档同步留到最后（避免 `AGENTS.md` 冲突）。

| WS      | 范围                     | 文件所有权                                                                                                                                                                                                                                                                                                    | 验证                                                                                               |
| ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **WS1** | P1+P2+P3 岛生命周期统一  | `apps/web/src/lib/astro/softNavMount.ts`(+test，新建)、`features/home/search/CommissionSearchIsland.astro`、`features/home/warning/AgeGateScript.astro`、`features/home/commission/CommissionImageNoticeScript.astro`、`features/home/search/AGENTS.md`、`apps/web/test/visual/search-soft-nav.spec.ts`(新建) | 新增 jsdom 单测覆盖 boot/teardown/取消延迟回调；`pnpm typecheck`；可行时按复现步骤做浏览器前后对比 |
| **WS2** | P4 图片精确映射          | `lib/images/sourceImageRegistry.ts`(+test)、`features/home/commission/CommissionEntries.astro`、`features/home/server/batchPayloadBuilder.ts`、`features/home/pages/HomePage.astro`                                                                                                                           | 更新单测：删除模糊回退断言，改为按 `commissionId` 解析；`pnpm typecheck`                           |
| **WS3** | P5 换图/导出竞争         | `apps/admin-worker/src/adminApi.ts`、其存储辅助模块（必要时 `scripts/exportWebFactSource.ts`）                                                                                                                                                                                                                | 单测覆盖「旧对象已被回收」路径；不得引入新 D1 schema，除非论证充分                                 |
| **WS4** | P6 发布结果反馈          | `apps/web/src/pages/build-info.json.ts`(新建)、`apps/web/public/_headers`、`apps/admin/src/lib/websiteRebuild.ts`、`apps/admin/src/lib/pendingRebuildSignal.ts`、后台展示组件                                                                                                                                 | 构建产物含 `build-info.json` 且 `dataRevision` 与快照一致；后台能在 revision 不匹配时保持 pending  |
| **WS5** | P7+P8 文档与 locale 收敛 | 根 `AGENTS.md`、`apps/web/AGENTS.md`、locale 配置                                                                                                                                                                                                                                                             | 文档与代码一致；主会话在 WS1–WS4 回收后执行                                                        |

**验收线**：必须解决的问题 = 需求达成 + 检查通过，不是「所有 reviewer 都同意」。

### 本次不做（需你决定或另开）

- **P9 双渲染器收敛** — 等技术性触发点（条目 markup 下次改动）。
- **P10 Playwright 离线 fixture** — 独立基建任务，做完再补视觉回归。
- **P11 branch protection** — GitHub 仓库设置，需要你开 required checks。
- **SSR / 框架迁移** — 不建议，现有显式发布模型无立即上线需求证据。

---

## 四、未测边界

未测 live/browser 性能（LCP/INP/构建耗时）；未跑完整本地构建、远端导出、部署；
未做并发 push/rebuild、R2 故障注入；P2/P3 未做浏览器复现；
未核实 Workers 旧资源保留策略与控制台 Workers Builds / Access 配置；未审查删除作品的清理路径。

仓库内没有当前线上性能基准；旧的 2026-04-08 dev 模式 React→vanilla 对照（已删除，见 git 历史）**不是**
当前线上性能或去掉 Astro 的证据。
