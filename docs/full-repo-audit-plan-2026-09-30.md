# 全仓审计整合计划（2026-09-30）

范围：`apps/web`、`apps/admin`、`apps/admin-worker`、`packages/domain`、`scripts`、`config`、工作区脚本与依赖图、Turbo/CI/构建配置、文档与仓库布局。

本文是**新增整合计划**，不修改历史基线结论。既有文档保持为各自时点的证据：

- `docs/audit-2026-09-29.md`（F01–F16）
- `docs/improvement-plan-2026-09-29.md`（A–H 阶段）
- `docs/performance-logic-audit-2026-09-29.md`（PERF-01–06、LOGIC-01–02、DB-01–04）
- `docs/database-optimization-assessment-2026-09-29.md`

本文只收录**前述文档未覆盖**的问题，并对已跟踪但未完成项单独列出（第 8 节），避免重复排期。

## 0. 本次证据强度说明

每条结论标注来源：

- **[直读]** 本次直接读取源码/配置确认。
- **[复核]** 子代理报告 + 本次抽查复核。
- **[待复核]** 子代理报告，本次未逐行验证，实施前必须先复现。

工具状态：`pnpm run typecheck` 四工作区全部通过（Turbo 缓存命中）；`pnpm run lint` 通过。本次为只读审计，未修改任何业务文件。

---

## 1. 第一批：用户可见的正确性缺陷

### P1-1　陈旧 HTML manifest 导致新增批次无法挂载 [直读]

**问题**

`queueLoad` 在读取 `manifestOverride` 之前就因为陈旧状态提前返回，导致文档承诺的「陈旧 HTML 回退路径」（根 `AGENTS.md:79–80`）在真实缓存场景下失效。

**证据**

- `apps/web/src/features/home/commission/loader/timelineViewLoader.ts:186–189`
  `if (isLocalLoaded()) { syncAutoLoad(); return false }`
  `isLocalLoaded()` 读取 `dataset.timelineLoaded === 'true'`，该值由**挂载时**从陈旧内联 manifest 取得的 `totalBatchCount` 推导。
- 同文件 `:192–196` 还有第二道闸门 `loadedBatchCount >= totalBatchCount`，用的是同一个陈旧 `totalBatchCount`。
- 同一文件 `:134–140` 的 `loadBatchesThrough` **确实**读取了 `manifestOverride?.totalBatches ?? totalBatchCount`，但控制流到不了这里。
- `apps/web/src/features/home/commission/loader/activeCharactersLoader.ts:229–239` 完全相同的两道闸门；`loadBatchesThrough` 在 `:178` 正确读取 `manifestOverride?.active.totalBatches`。

**触发路径**

1. 用户访问到带缓存的 HTML，内联 manifest 记录 `totalBatches: N` 且 `data-*-loaded="true"`。
2. 管理员新增作品，批次变为 `N+1`。
3. 用户导航到新作品的 hash → 客户端取到最新 manifest → `queueLoad` 在 `isLocalLoaded()` 处提前返回，新批次永不挂载。

即使 `loaded` 不为 true，第 2 道闸门仍会因陈旧 `totalBatchCount` 拦住最后一次加载。

**修复方向（二选一，优先第一种）**

- 把 `manifestOverride` 的生效提前到两道闸门之前：进入 `run()` 后先取有效总数，再做 loaded/总数判断；或
- 闸门改为「本地已加载数 ≥ 有效总数」，其中有效总数来自 `manifestOverride`。

**回归用例（当前缺失）**

现有回退测试（`activeCharactersLoader.test.ts:209–323`、`archivedCharactersLoader.test.ts:306–423`、`timelineViewLoader.test.ts:356–405`）一律以 `data-*-loaded="false"` 起步，从不覆盖生产实际会遇到的 `loaded="true"` + 陈旧计数分支。需要新增：`loaded="true"` + 内联 manifest 旧计数 + 新 manifest 更大计数 → 断言新批次被挂载且目标可滚动到位。

**验收**：上述用例先红后绿；`loaded="true"` 且总数未变时不得产生多余请求。

---

### P1-2　后台改名与排序使用两条互不协调的写队列 [待复核]

**问题**

`apps/admin/src/hooks/useCommissionManager.ts` 同时存在两套写路径：

- `characterWritesRef`（`:320`）＋ `enqueueCharacterWrite`（`:336–340`）—— 串行化、逐条等待。
- `orderSaveQueueRef`（`:328`）—— latest-payload 合并，只保留最后一次排序意图。

两者都写 `characters` 表，但彼此不去重、不合并。若改名请求携带的是快照里的旧 `status`，与排序请求交错时可能把状态改回去。

**为什么标 [待复核]**

报告所述「改名 PATCH 携带旧 status」这一步本次未逐行验证。**先复现再修**：

1. 在 `useCommissionManager` 的测试中构造「排序未完成时触发改名」，观察发出的 PATCH/DELETE 载荷；
2. 确认改名请求体是否包含 `status`（`adminPersistence.ts` 的更新路径按 `status` 重建排序）；
3. 只有确认存在覆盖，才按「合并到同一合并队列」或「改名走读-改-写最新状态」修复。

**验收**：新增并发用例断言改名与排序都生效，且 `status` 与 `sort_order` 不互相回退。

---

### P1-3　`localStorage`/`sessionStorage` 配额失败被静默吞掉 [复核]

**问题**

打开分组、滚动锚点、待发布标记都写入本地存储，写入失败只在 `try/catch` 里静默返回。

**证据**

- `apps/admin/src/hooks/useCommissionManager.ts:185` 附近写 `disclosureStorageKey`。
- `apps/admin/src/components/edit/AdminEditPage.tsx:61–121` 滚动锚点读写，异常分支注释说明「存储不可用时不影响页面编辑」，无用户提示。

**修复方向**：捕获配额类错误（`QuotaExceededError`）后给出一次非阻断提示，明确「展开状态/滚动位置本次不会保留」；不要把本地存储不可用渲染成加载失败。存储体积方面，`admin-existing-open` 在角色数量多时是可压缩的（去重后写 ID 数组），但**先做提示，再谈压缩**。

**验收**：单测模拟 `setItem` 抛错，断言出现提示且编辑功能不受影响。

---

### P1-4　`workGroupId` / `partNumber` 空串与 null 不对称 [复核]

**问题**

`apps/admin-worker/src/adminApi.ts:586–588` 只校验两个字段**存在**（`Object.hasOwn`），随后 `parseCommissionFieldsFromJson` 会把空串规整为 `null`。于是 `{ workGroupId: "uuid", partNumber: "" }` 通过了「两者都在」的检查，到持久层才因「必须同时设置」抛错，最终表现为 500 而不是 400。

**修复方向**：在 `adminApi.ts` 里把空串归一化提前到存在性校验之前，使两者都为 null 或都有值；不一致时返回明确的 400 校验消息。

**验收**：新增「空串 partNumber + 有效 workGroupId」用例，断言 4xx 且含可读原因；不得出现 500。

---

### P1-5　作品日期允许未来日期 [复核]

**问题**

`apps/admin-worker/src/adminPersistence.ts:153–160` 只校验日历有效性（能正确拒绝 2 月 30 日），不拒绝比如 `2999-12-31`。

**修复方向**：这是**业务规则**，需要先确认意图。若允许预售，用「不得晚于当前时间 + N 天」；若不允许，直接拒绝未来日期。**实施前请确认选择哪一条**，不要自行决定。

---

## 2. 第二批：结构重复与唯一事实源

### P2-1　`apps/web` 复制了 domain 的三个模块，且已经分叉 [直读]

**问题**

`apps/web/src/lib/` 下三处实现与 `packages/domain` 几乎同源，而 `apps/web/package.json` **已经**依赖 `@commission-index/domain`。`packages/domain/src/index.ts` 已经导出了这三组 API。

| domain                                            | web 副本                                                                         | 差异（本次直读确认）                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/domain/src/dateSearch.ts`（87 行）      | `apps/web/src/lib/date/search.ts`（已删除；web 改用 `@commission-index/domain`） | 正则、`isValidDateParts`、导出集合一致；仅空行与 `const parts` 书写差异。属于纯复制。                                                                                                                                                                                          |
| `packages/domain/src/commissionSearchMetadata.ts` | `apps/web/src/lib/search/commissionSearchMetadata.ts`                            | **已分叉**：入参 domain 要求 `fileName: string`（`domain:14`），web 没有；`buildCommissionSearchDomKey` domain 用 `fileName`（`domain:60–62`），web 用 `publicId`（`web:52–54`）。                                                                                             |
| `packages/domain/src/timeline.ts`                 | `apps/web/src/lib/commissions/timeline.ts`                                       | **已分叉**：domain 用类型谓词 `commissionDate !== null`（`domain:51`）并自带 `sortCommissionsByDate`（`domain:38–41`）；web 用真值过滤 `.filter(c => c.commissionDate)`（`web:44`）加非空断言 `commissionDate!.slice(0,4)`（`web:52`），且从 `@lib/commissions` 外部引入排序。 |

**风险**

1. 行为已经不同。`commissionSearchMetadata` 的 DOM key 契约不一致，意味着同一份搜索元数据在前后端会生成不同的锚点键。
2. 测试覆盖错了对象：`apps/web/src/lib/search/commissionSearchMetadata.test.ts` 测的是**副本**，domain 的正确性无人验证。

**修复方向（顺序不能颠倒）**

1. 先补齐 domain 测试（见 P2-2），把 web 两个测试文件的用例迁入 `packages/domain/src/`。
2. 逐条对比 domain 与 web 的实际输出，特别是 DOM key 与 `year`/`month` 切片来源。**先确认公站 DOM 依赖的是哪个键**，再决定合并到哪一侧——这一步不能靠猜，改错会直接破坏搜索锚点跳转。
3. 改 import 指向 `@commission-index/domain`，删除 web 三个副本。
4. 确认 `timeline` 的唯一消费方（报告称 `apps/web/src/lib/.../buildSitePayload.ts`）行为不变。

**验收**：domain 测试覆盖等价用例；公站搜索锚点跳转、时间线年份分组、日期检索三类行为在合并前后完全一致（用现有公站构建产物做对照）。

---

### P2-2　`packages/domain` 几乎没有测试 [直读]

**问题**

`packages/domain` 约 1.7k 行，只有 `timeline.test.ts` 一个文件、一个用例。以下模块**零测试**：

- `src/search.ts`（约 878 行，大量缓存逻辑）——公站搜索的核心。
- `src/dateSearch.ts`、`src/commissionSearchMetadata.ts`
- `src/commissionFileName.ts`（文件名校验，含控制字符/扩展名/`..` 拒绝逻辑）
- `characterAliases.ts`、`creatorAliases.ts`、`keywordAliases.ts`

**优先级用例**

1. 文件名校验拒绝控制字符、图片扩展名、路径穿越。
2. `search.ts` 的严格前缀匹配与 and/or/否定语义。
3. 查询缓存的淘汰与命中边界。

**为什么排在高位**：P2-1 的合并、以及任何 `search.ts` 重构，都必须先有这层网。没有它，合并只能靠肉眼对比。

---

### P2-3　同类归一化在各 alias 模块间不一致 [待复核]

**问题**

- `characterAliases.ts` / `keywordAliases.ts` 用**小写化键**去重。
- `creatorAliases.ts` 用 `[...new Set(normalized)]`，**大小写敏感**，且 `normalizeCreatorName` 不做小写化。
- `search.ts` 另有 `normalizeSuggestionMatchToken` 路径。

**风险**：任何先小写再查表的调用都会静默查不到作者别名。

**实施前先做**：写一个跨模块查找等价性测试矩阵（含 `"Artist (part 2)"`、`"Lúcio"` vs `"lúcio"`、带引号建议词），确认是否真的存在查不中的路径。如果作者名**有意**保留显示大小写，那就在注释里写清契约并加断言，而不是统一小写。

---

## 3. 第三批：构建与运行性能

### P3-1　搜索聚焦时的无上限预取 [直读]

**问题**

`apps/web/src/features/home/commission/batch/homeCharacterBatchClient.ts:125–134`：

```ts
const firstBatchIndex = Math.max(0, Math.floor(startBatchIndex))
const finalBatchIndex = Math.min(Math.floor(targetBatchIndex), totalBatchCount - 1)
for (let batchIndex = firstBatchIndex; batchIndex <= finalBatchIndex; batchIndex += 1) {
  void fetchHomeCharacterBatch({ batchIndex, doc, status }).catch(() => {})
}
```

循环**没有并发上限**，且吞掉全部失败。调用方 `commissionSearchController.ts:295–300` 传入 `targetBatchIndex = totalBatchCount - 1`。

叠加 `ACTIVE_BATCH_SIZE = 1`（每个批次一个角色），一次聚焦即等于「按角色数量发出全部请求」。加载器自己用的是 `ACTIVE_BATCH_FETCH_CONCURRENCY = 4`（`activeCharactersLoader.ts:27`），预取路径没有遵守这个约束。

`homeTimelineBatchClient.ts:95–118` 有同样的循环。

**修复方向（按收益排序）**

1. 把预取限制在与加载器一致的 4 并发窗口内，剩余排队；
2. 提高批量大小（每批 5–10 个角色）从源头减少批次数——这条同时改善首屏与搜索，但会改动批次契约，需要评估 URL 与缓存版本策略；
3. 聚焦时只预取**首批**，其余交给滚动/搜索按需加载。

**验收**：记录聚焦到首次结果可用之间的请求条数与耗时；在 100+ 角色的快照上对比改动前后。**先测基线再改**，不要凭感觉调。

---

### P3-2　`fuse.js` 按需加载路径确认无误 [直读，非缺陷]

`hydrateSearchIndexFuse` 懒加载 fuse，`astro.config.ts` 将其拆到 `vendor-search` 分块，静态 import 只出现在测试文件。**这是正确实现，不要为了「统一」改成静态导入。**

---

### P3-3　裁剪器（Cropper）随共享分块下发 [已跟踪，见 PERF-04]

管理端构建中 `DuplicateCommissionNotice-*.js` 164.20 kB / gzip 52.26 kB，**其中包含 Cropper**，而裁剪只在打开裁剪弹窗时才需要。此项已在 `PERF-04` 记录，本文不重复排期，仅在实施时按下述验收：打开编辑页不得下载裁剪器，首次打开裁剪弹窗才加载。

---

### P3-4　重复的批次客户端实现 [复核]

`homeCharacterBatchClient.ts` 与 `homeTimelineBatchClient.ts` 各自维护 `batchRequestCache` 与近乎同构的 fetch/prefetch 实现。修 P3-1 时要改两处，容易只改一处造成行为不一致。

**修复方向**：抽成一份参数化的缓存 + 拉取helper（按 status 参数化），或在两处同时写明「此处与另一文件保持同步」的交叉引用注释。**优先抽取**，因为 P3-1 的并发上限必须同时生效。

---

### P3-5　首屏内联脚本与客户端视图逻辑重复 [复核]

`apps/web/src/features/home/server/StaticCommissionSections.astro:251–419` 含约 168 行 `is:inline` 脚本，内含硬编码类名数组（`["hidden","flex"]`、`["grid","hidden"]` 等），与 `commissionViewModeDomSync.ts`、`timelineViewLoader.ts:syncByMode` 的视图模式逻辑重叠。

**结论**：这**可能是**有意的首屏优化，不是随手重复。处理方式二选一：抽出为 `.ts` 文件后仍以 `is:inline` 引入（保留时序，消除散落字面量），或在两处各写交叉引用注释说明「内联子集是首屏必需」。**不要直接删除内联脚本**——删掉会造成视图模式闪烁。

---

### P3-6　仓库体积 [直读]

- 根 `node_modules` 约 2.4 GB，`.turbo` 约 165 MB。
- 公站构建产物约 23 MB，其中**图片占主导**（单张 jpg 最大约 288 KB），JS 最大分块约 48 KB。

**结论**：运行期瓶颈在图片，不在 JS。`pnpm run clean` 已覆盖主要缓存目录。此项不设独立工作包，仅在需要时清理；不要为「减小体积」去动 JS 分块策略。

---

## 4. 第四批：CI 与工具链

### P4-1　CI 离线 fixture 的 schema 版本与 domain 常量不一致 [直读]

**问题**

`.github/workflows/ci.yml:44` 以内联 heredoc 写入 `schemaVersion: 1` 的空 fixture，而 `packages/domain/src/factSource.ts` 定义的是 `GENERATED_FACT_SOURCE_SCHEMA_VERSION = 3`。

后果：CI 的 `astro check` 校验的是 **v1 形状的空数据**，无法发现 v3 才要求的字段缺失；一旦加上 schema 守卫，CI 会以「fixture 过期」这种看不出原因的方式失败。fixture 还是无类型的内联 JS。

**修复方向**

1. 把 fixture 生成移到 `apps/admin-worker/scripts/` 下的 `.ts` 脚本，import `GENERATED_FACT_SOURCE_SCHEMA_VERSION` 与 `GeneratedFactSource*` 类型。
2. CI 调用该脚本。
3. 加一条断言测试：fixture 的 `meta.schemaVersion` 等于 domain 常量。

**验收**：手改常量后 CI 能明确报出 fixture 版本不匹配。

---

### P4-2　pnpm store 被缓存两次 [直读]

`.github/actions/setup/action.yml`：

- `:17–20` `actions/setup-node@v6` 已配置 `cache: pnpm`，其缓存键基于 `pnpm-lock.yaml`。
- `:22–27` 又用 `actions/cache@v5` 手工缓存 `~/.local/share/pnpm/store`，键同样基于 lockfile。

两份内容相同的缓存占用配额，恢复顺序还不确定。

**修复方向**：删除手工 `actions/cache` 块，依赖 `setup-node` 的 `cache: pnpm`。若确实需要自定义键，则反过来：`setup-node` 设 `cache: ''`，只保留手工块。**二选一，不要都留。**

---

### P4-3　两个发布工作流重复实现同一管线 [复核]

`.github/workflows/ci.yml` 的 web 任务与 `rebuild.yml` 都实现：导出快照 → 读 revision → `astro check` → 部署 → 对 `dist` 取 sha256。两者共享 `release-web-production` 并发组（意图正确），但管线有两份手工副本，会漂移。

**修复方向**：抽成可复用 workflow（`workflow_call`）或复合 action。**注意**：两个入口的互斥与过期候选跳过逻辑已经实现且有文档，本节只做去重，不改语义。

---

### P4-4　快照契约缺可执行校验 [复核]

`turbo.json:29,39` 对 `web#build` 与 `web#fact-source:export` 均设 `cache: false`，`AGENTS.md` 说明这是为了避免 Turbo 恢复陈旧的 `generated/`。但安全属性目前**只是注释**：没有任何可执行步骤校验 `generated/fact-source/content.json` 的 `meta.revision` 与 `WEB_BUILD_CACHE_TOKEN` 一致。

**修复方向**：加 `apps/web/scripts/validateSnapshotContract.ts`，断言 revision 匹配，否则失败；接入 build 的 `dependsOn`。**先有这个闸门，再谈是否恢复 Turbo 缓存。**

---

### P4-5　`config/vitest.config.ts` 覆盖范围与 setup [直读，已澄清]

`config/vitest.config.ts` 全局 `environment: 'node'`，include 覆盖全部工作区。**注意：不存在全局 `setupFiles` 指向 `apps/web/test/setup.tsx`** —— 该文件已删除（见 `git status`），配置里也没有 `setupFiles`。本次审计过程中曾出现「全局 setup 硬绑 web 路径」的说法，**与当前源码不符，不作为问题**。

需要真正留意的只有一点：`apps/admin` 的 React 测试依赖按文件切换 jsdom。当前 `environment: 'node'` 为默认，若后续新增 React 测试忘记标注环境，会得到误导性失败。建议在 `apps/admin/AGENTS.md` 记一条约定。

---

### P4-6　Playwright 视觉覆盖 [复核]

- `config/playwright.config.ts` 单视口（1440×1600），无 `deviceScaleFactor`，无移动/平板矩阵，而 `AGENTS.md` 明确把 HiDPI 与 768/960/1280 断点列为验收项。
- 管理端 UI fixture 入口的 `testMatch` 是**显式文件列表**，新增 spec 不会自动纳入。

**修复方向**：视觉配置增加移动与 `deviceScaleFactor: 2` 项目；`testMatch` 改为 glob 约定（如 `*.fixture.spec.ts`），避免新增用例被静默跳过。此项与既有「无障碍/视觉矩阵未验收」条目衔接，不重复排期。

---

### P4-7　`scripts/devAdminRemote.ts` 的端口守卫 [复核]

`:175` 行左右的脚本只对 worker 端口做 `assertPortAvailable`，未守 admin（4174）与 web 端口；陈旧 dev server 会造成端口冲突。此外失败日志不区分「worker 崩溃」与「仍在启动」。

**修复方向**：把端口检查扩到三个端口，并把超时与崩溃区分开输出。

---

## 5. 第五批：文档同步

### P5-1　`/admin` 404 的文档与配置不一致 [直读]

根 `AGENTS.md:212` 写「`/admin` 与 `/api/admin/*` 必须 404 —— 通过 `assets.not_found_handling = "404-page"` **以及 `apps/web/public/_redirects` 中的显式映射**强制」。

实际 `apps/web/public/_redirects` 只有三行：

```
/commission / 301
/feed.xml /rss.xml 301
/rss /rss.xml 301
```

**没有任何 `/admin` 条目。**

**修复方向**（二选一，需明确选择）

- 补上显式映射；或
- 改文档为「仅由 `assets.not_found_handling` 强制」，并把 `AGENTS.md:215–217` 的 `curl` 验证步骤写成正式门禁。

**不要两边各写一半**——当前状态正是两边不一致造成的验证歧义。

---

### P5-2　`search/AGENTS.md` 文件清单过期 [待复核]

`apps/web/src/features/home/search/AGENTS.md` 列出的文件名与目录实际内容不符（`CommissionSearchTemplate.astro`、`commissionSearchKeyboardNav.ts`、`commissionSearchPanelLoadedState.ts`、`commissionSearchSuggestionPanelController.ts`、`commissionSearchViewModeStore.ts`）。

**修复方向**：按实际文件名重写该清单，或删除清单直接指向目录。**实施前请以 `ls` 结果为准逐条核对**（本文未逐条验证）。

---

### P5-3　嵌套 `AGENTS.md` 是重定向桩 [直读]

根 `AGENTS.md` 多处指向 `apps/admin/AGENTS.md` 等下游文档（`:100`、`:236`、`:238`）。而各工作区下的 `CLAUDE.md` 全部是「Canonical agent instructions live in `AGENTS.md`」的重定向桩。

需要确认的是**下游 `AGENTS.md` 本身**是否承载了根文档所引用的内容。若某些小节在根文档被引用但下游并未展开，需要补齐或改引用指向。

---

## 6. 已验证不成立 / 不得作为缺陷处理的条目

这一节是为了**防止后续实施误改**。以下条目在本次审计过程中被提出，但经复核**不成立**：

| 条目                                             | 说法                           | 复核结论                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 `batch()` 非事务、部分成功会留下不一致        | 建议加幂等键、写后 SELECT 检测 | **不成立。** Cloudflare 官方文档明确：`batch()` 的语句是 SQL 事务，任一句失败会**中止或回滚整个序列**。`adminPersistence.ts:227–247` 的 `runStatementsAtomically` 实现正确。`result.success === false` 后抛错是无害的防御。**不要按「非事务」前提去改数据写入路径。** |
| 全局 `setupFiles` 硬绑 `apps/web/test/setup.tsx` | 影响全部工作区                 | **不成立。** 当前 `config/vitest.config.ts` 无 `setupFiles`，该文件已删除。（见 P4-5）                                                                                                                                                                                |
| `normalizeCommissionKeyword` 在多处重复定义      | 维护负担                       | **未复现。** 全仓只有 `apps/admin-worker/src/adminPersistence.ts:131` 一处定义。                                                                                                                                                                                      |
| R2 旧文件名回退探测是死代码                      | 可直接删除                     | **暂不处理。** 该回退服务迁移前的历史对象。删除前必须先在生产 D1 确认 `source_images` 无遗留行（`commission_id IS NULL`）。**在拿到该查询结果前不得删除。**                                                                                                           |
| `mountLegacyHome*Batch` 是死代码                 | 可删除                         | **不是死代码。** 是 manifest 路由缺失时的生产回退，且有测试覆盖。保留。                                                                                                                                                                                               |
| `clearHome*BatchRequestCacheForTests` 是死代码   | 可删除                         | **不是死代码。** 测试专用导出，多处于测试中被引用。保留。                                                                                                                                                                                                             |
| `fuse.js` 应改为静态加载                         | 简化分块                       | **不要改。** 按需加载是正确的（见 P3-2）。                                                                                                                                                                                                                            |
| `hasMoreHomeCharacterBatches` 未被使用           | 死导出                         | **成立但极低价值。** 全仓仅有定义处 `homeCharacterBatchClient.ts:56`，无调用方。可删或标 `@internal`。                                                                                                                                                                |

---

## 7. 可清理清单

优先级低，但确认安全：

1. `hasMoreHomeCharacterBatches`（`homeCharacterBatchClient.ts:56`）—— 无调用方的导出。
2. 根 `package.json` 的纯别名脚本：`build` → `build:web`、`deploy` → `deploy:web`、`dev:admin` 与 `dev:admin:remote` 同为 `tsx scripts/devAdminRemote.ts`。
3. `apps/admin-worker/package.json` 中 `dev` 与 `dev:remote` 完全相同。
4. `apps/web/src/lib/{search/commissionSearchMetadata.ts, commissions/timeline.ts}` —— **仅在第 2 节完成后**删除，不能先删（`date/search.ts` 已合入 `@commission-index/domain` 并删除）。

**不要清理**：`apps/web/src/lib/` 下其他文件、任何 `is:inline` 脚本、R2 回退探测、legacy batch 挂载函数、测试专用导出。

---

## 8. 既有计划中仍未完成项（不重复排期，仅登记）

来自 `docs/improvement-plan-2026-09-29.md`，这些**不是**本次新发现，实施顺序不变：

- 生产等价的隔离 D1/R2 并发创建验证（本地 SQLite + R2 recorder 不构成 Cloudflare 运行时证明）。
- R2 孤儿对象目前只留警告，无重试队列/回收器。
- R2 get/put/metadata/cleanup 各阶段的完整故障覆盖。
- GitHub required checks / 分支保护需在控制台核验。
- 真实 GitHub 并发发布与最终 Worker revision 验证。
- 无障碍验收：读屏、320/390/768/1440 视口、200% 文字缩放、主题、reduced motion。
- 第四阶段性能基线：Playwright fixture 模式、截图审查、键盘/对比度/触摸测量、首屏体积与搜索响应基线。
- 可选的 Astro 与手写静态生成对比实验。

同样来自 `docs/performance-logic-audit-2026-09-29.md` 的 `PERF-01`（D1 缺少 `(character_id, file_name DESC)` 索引）、`PERF-02`（重复 schema 探测）、`PERF-03`（`arrayBuffer` 未流式）、`PERF-05`（搜索预取，与本文 P3-1 同一处，**按 P3-1 执行即可**）、`PERF-06`（CI 图片缓存未跨运行恢复）保持原有排期。

`LOGIC-01` 已修复，本次复核确认：`commissionSearchModel.ts` 的输出缓存与索引缓存均已改用身份比较而非长度比较。

---

## 9. 建议执行顺序

```
第 1 步  P1-1  陈旧 manifest 回退        ← 用户可见故障，改动小，先补用例
第 2 步  P1-4  空串/null 不对称 400     ← 小改动，消除 500
第 3 步  P1-3  存储失败提示
第 4 步  P1-2  写入队列并发              ← 必须先复现再改
第 5 步  P2-2  domain 测试补齐            ← 是 P2-1 的前置
第 6 步  P2-1  domain 去重                ← 合并前逐条对比 DOM key
第 7 步  P3-1 预取并发上限（含 P3-4 抽取）
第 8 步  P4-1 CI fixture 版本  +  P4-2 缓存去重
第 9 步  P4-4 快照契约校验                ← 之后才评估恢复 Turbo 缓存
第 10 步 P5-1 文档与配置对齐（选一侧）
第 11 步 其余 P2-3 / P3-5 / P4-3 / P4-6 / P4-7 / P5-2 / P5-3 / 第 7 节清理
```

`P1-5`（未来日期）需要先确认业务规则再排期。

## 10. 验收与约束

- 每个工作包**先写能失败的回归用例**再修，遵循既有仓库做法（Vitest 按文件切 jsdom、真实 SQL 用 `apps/admin-worker/test/sqliteD1.ts`）。
- 改了 API、schema 或行为后同步 `docs/` 与对应 `AGENTS.md`。
- 架构级变更（新增/删除/移动文件）同步根 `AGENTS.md`。
- 本计划不含任何生产部署、生产数据写入或凭证操作。
- 不可逆操作（删除文件、强推）单独确认后再做。
