# 全仓审计（2026-11-11）

基线 `aca9bf3`（master）。范围：`apps/web`、`apps/admin`、`apps/admin-worker`、`packages/domain`、`scripts/`、
`config/`、`.github/`。结论分五类：逻辑缺陷、安全、重复与死代码、架构与 CI、前台性能；另附后台首页设计意见。行号会漂移，动手前重新核对。

状态标记：**已修**（本轮分支已含修复与测试）· **待修**（已读代码确认，未动）· **owner**（需要 owner 裁决或只能在平台设置里做）·
**未证实**（读代码推断，未复现）。

## 0. 结论

- 工作区边界（web / admin / admin-worker / domain）和静态导出模型不需要调整。需要动的是局部：worker 内部以及
  worker 与 web 之间分叉出去的 domain 逻辑、worker 路由与持久化层的样板、几道缺失的 CI 闸门、与代码不符的文档。
- 10-12 审计里 admin（ADM-1…11）、worker（WRK-4/6/7/8/11/12/13/14）、CI（CI-2…13）大部分条目仍未修；状态见 §7。
- 本轮确认并修复的缺陷见 §1–§2 中标 **已修** 的条目（PR #476）；每条都带一个修复前失败的测试。其余条目未动。

## 1. 逻辑缺陷

### admin

| ID   | 严重度 | 位置                                                                    | 问题                                                                                                                                              | 状态 |
| ---- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A-1  | H      | `components/edit/KeywordReplacePopover.tsx`                             | 批量关键词替换把 bootstrap 的原始 JSON `links`（`'[]'`）直接发给 PATCH，worker 按行拆分后当成非法 URL 返回 400；自链接校验上线后对所有行失效。    | 已修 |
| A-2  | M      | `components/create/AddCommissionForm.tsx`、`pages/AdminCreatePage.tsx`  | 创建成功后本页不刷新 bootstrap：刚建的多图组不出现在 Part group 下拉里，重复提示也看不到刚建的记录。                                              | 已修 |
| A-3  | M      | `components/edit/CommissionEditDrawer.tsx`                              | 关闭抽屉或切换搜索结果直接丢弃未保存编辑（旧 ADM-1）。                                                                                            | 待修 |
| A-4  | M      | `lib/websiteRebuild.ts`、`lib/liveBuildInfo.ts`                         | 轮询 `build-info.json` 无超时；请求挂起时发布按钮永久停在 Checking（旧 ADM-2）。                                                                  | 已修 |
| A-5  | M      | `components/edit/CommissionManager.tsx`、`AdminSuggestionDashboard.tsx` | 键盘「下移」每次都丢焦点（React 移动的是被聚焦节点）；到端点时按钮还会被 disabled（旧 ADM-7 扩大）。                                              | 待修 |
| A-6  | L-M    | `pages/AdminEditPage.tsx`                                               | `isReloadNavigation()` 在文档整个生命周期都为真：reload 之后任何一次 SPA 进入 /edit 都会从 storage 恢复旧锚点，与 App 的恢复竞争。                | 待修 |
| A-7  | L-M    | `hooks/useCommissionManager.ts`                                         | 排序 v1 成功、v2 失败时 v1 不 `markPendingRebuild` 也不广播（旧 ADM-4）；Enter 后 blur 发两次重命名 PATCH（ADM-5）；删除角色绕过写队列（ADM-6）。 | 待修 |
| A-8  | L-M    | `components/create/CommissionFormFields.tsx`                            | 日历翻到不含选中日/今天的月份后没有任何可 Tab 的格子；两者同月时有两个 Tab 停靠点。                                                               | 待修 |
| A-9  | L      | `components/FloatingRebuildButton.tsx`                                  | 等待确认期间又有保存时，琥珀色 Rebuild 按钮旁仍显示「已确认上线」4 秒。                                                                           | 待修 |
| A-10 | L      | `components/edit/KeywordReplacePopover.tsx`                             | `String.replace` 会解释替换文本里的 `$&`、`$$`。                                                                                                  | 已修 |
| A-11 | L      | `lib/adminApi.ts` `triggerRebuildDeploy`                                | 先 `.json()` 再看 `ok`：HTML 5xx 或登录页会显示成 `Unexpected token '<'`。                                                                        | 已修 |
| A-12 | L      | `components/edit/CommissionThumbnailGrid.tsx`                           | 缩略图重试一次失败后永久显示 No image（旧 ADM-10）。                                                                                              | 待修 |

测试缺口（都对应上面的条目）：关键词替换没有用真实 `links` 格式的夹具（A-1 因此长期没暴露，本轮已补）；排序队列「v1 成功 v2
失败」；Enter 后 blur 只发一次 PATCH；创建后选项刷新；reload 后 SPA 再进入 Edit；重排后的焦点；抽屉带脏关闭。

### worker + domain

| ID   | 严重度 | 位置                                                   | 问题                                                                                                                                                       | 状态                |
| ---- | ------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| W-1  | M      | `adminPersistence.ts` 别名批量保存                     | 内存里按不分大小写的 key 合并，落库却按精确主键：`Full Body` 与 `full body` 各存一行，读出来是并集，后台无法删掉其中一行；与 `ai-agent-guide` 的描述矛盾。 | owner               |
| W-2  | M      | `packages/domain/src/search.ts` 分词                   | 分词正则不认 `!"…"`：建议补全自己生成的 `!"blue dragon"` 被拆成两个带引号的词，「排除短语」变成「什么都不匹配」。                                          | 已修                |
| W-3  | M      | `search.ts` Fuse 回退                                  | strict 结果为空就走模糊匹配：没有 2019 年作品时搜 `2019` 会模糊命中相邻年份的日期 token；同一查询在 Fuse 加载前后结果不同。                                | 未证实              |
| W-4  | M      | `scripts/listR2Orphans.ts`                             | 先读 D1 引用集再列 R2：期间完成的上传会被判为孤儿，`--delete` 会删掉在用图片；返回形状不校验时引用集可能为空。                                             | 待修                |
| W-5  | L-M    | `adminApi.ts` `POST /suggestion`                       | 键名写错（非 `keywords`/`keywordsJson`）时静默清空精选关键词并返回 200。                                                                                   | 待修                |
| W-6  | L-M    | `search.ts` 建议 token                                 | 全角空格不切分建议 token：日文输入法下 `アリア　ク` 没有建议，选中建议时连前一个词一起被替换。                                                             | 已修                |
| W-7  | L-M    | `search.ts` `\|` 求值                                  | strict 路径从左到右求值，Fuse 扩展语法按「段内 AND、段间 OR」，两条路径对 `blue \| wolf red` 结果不同；预期语义没有测试约束。                              | owner               |
| W-8  | L      | `adminPersistence.ts` 排序、`adminApi.ts` 换图         | 旧 WRK-8（排序 3n+1 个绑定参数，存在性 SELECT 也绑定全部 id）、WRK-13（换图期间作品被删会写入 `commission_id = NULL` 行，且该行让 R2 对象永远不被回收）。  | 部分（WRK-13 已修） |
| W-9  | L      | `adminData.ts` 别名计数、`creatorAliases.ts`           | 旧 WRK-11（key 冲突时计数覆盖而非累加）；`(part N)` 剥离规则两套（`Q(part 2)` 在别名里是独立作者，在建议词里被剥成 `Q`）。                                 | 待修                |
| W-10 | L      | `scripts/exportWebFactSource.ts`                       | 旧 WRK-6（「缺失」正则含 `404`，而合成的错误消息里拼了含日期的旧文件名）、WRK-12（mimeType 来源不一致）、WRK-14（`spawnSync` 无 `maxBuffer`）。            | 部分（WRK-14 已修） |
| W-11 | L      | `search.ts` 前缀扩展、`adminPersistence.ts` sort_order | 精确命中后不再做前缀扩展（新增关键词 `cat` 后搜 `cat` 不再出现 `catgirl`）；并发建角色会拿到相同 `sort_order`，读取端缺 `id` 次序。                        | owner               |

文档与代码不一致：`api-reference.md` 称 `Uploaded image is empty.` 可达（实际先返回 `Source image is required…`）；
`scripts/AGENTS.md` 称 `syncMissingSourceImages` 下载后校验，实际不校验 sha256 / 大小。

### web

| ID   | 严重度 | 位置                                                                     | 问题                                                                                                                                            | 状态 |
| ---- | ------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| F-1  | M      | `features/home/search/commissionSearchController.ts`                     | teardown 不取消 rAF / timer / 索引 promise（旧 WEB-7）：慢网下切语言，旧页的查询会过滤新页的条目，并把 `?q=` 写到新地址上。                     | 待修 |
| F-2  | M      | `features/home/homeScrollRestore.ts`                                     | `sessionStorage` 未包 try，且属于关键挂载：禁用站点存储的浏览器里整个首页运行时不挂载（导航、归档开关、视图切换全失效）。                       | 待修 |
| F-3  | M      | `commission/commissionViewModeDomSync.ts`                                | 150ms 内连切两次视图，前一次过渡的定时器会把面板切回去，URL 与面板不一致。                                                                      | 待修 |
| F-4  | M      | `server/StaticCommissionSections.astro` 首帧脚本                         | 首帧脚本与挂载代码用的 class 不同（`w-0` 对 `scale-x-0`，`gray-700` 对 `gray-800`）：`/?view=timeline` 进入后移动端「按角色」下划线永不再出现。 | 待修 |
| F-5  | M      | `lib/utils/strings.ts`、`lib/characters/nav.ts`                          | 全 CJK 角色名 slug 为空串、仅标点或大小写不同的名字 id 相撞：侧栏链接失效，搜索时该分区被隐藏。读取边界不校验。                                 | 待修 |
| F-6  | M      | `search/commissionSearchIsland.ts`                                       | 动态 `import()` 无 catch：跨部署留着的标签页拿不到旧 chunk 时搜索静默失效。                                                                     | 待修 |
| F-7  | L-M    | `commission/linkDisplay.ts`                                              | 不匹配已知站点的链接被丢弃（已发布作品仍显示「想看」按钮）；`includes('x.com')` 会把 `dropbox.com` 标成 Twitter。                               | 待修 |
| F-8  | L-M    | `nav/hamburger/mobileHamburgerMenu.ts`                                   | 旧 WEB-10：开合不管理焦点、无 `inert`；搜索动作绑在 `pointerdown`，滚动手势会误触。                                                             | 待修 |
| F-9  | L      | `search/commissionSearchKeyboard.ts`、controller                         | 旧 WEB-8（关闭后 `activeIndex` 不复位，Enter 被吞）、WEB-13（同帧重复 recompute）、`requestedArchivedForSearch` 收起后不复位。                  | 待修 |
| F-10 | L      | `IllustratorInfo.astro`、`Footer.astro`、搜索岛                          | `<time>` 内容不合法；combobox/listbox 语义是 ARIA 1.0 写法且 `ul` 里放 `div`；ja / zh-tw 页面硬编码英文 `Anon` / `Part n`。                     | 待修 |
| F-11 | L      | RSS、favicon、页脚                                                       | 旧 BLD-2/3/5/6/7/8 均未修（RSS author 与链接缺 `/`、footer 在 `main` 内、`id` 含空格、图片 alt 全是版权串、tile 路径 404、年份构建期固定）。    | 待修 |
| F-12 | M      | `commission/TimelineView.astro`、`server/StaticCommissionSections.astro` | 时间线视图没有把 `locale` 传给 `CommissionEntries`：ja / zh-tw 页面的时间线条目里「设计稿」「想看」「图片缺失」等文案回退成英文。               | 待修 |

## 2. 安全

部署前提：后台与 worker 在 Cloudflare Zero Trust 之后，worker 自身不鉴权；仓库公开。只能在平台上核实的设置单列在本节末尾。

| ID  | 严重度 | 问题                                                                                                                                                                                                                                                                | 状态           |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| S-1 | H / M  | 所有 POST 路由都接受无预检的跨站请求（旧 WRK-3）：`request.json()` 不看 Content-Type，`formData()` 接受 multipart。可创建作品、替换图片（旧对象随即删除，不可恢复）、触发发布。跨站是否带上会话 cookie 取决于 Access 的 SameSite 设置；同站脚本不受 SameSite 限制。 | 已修           |
| S-2 | M      | `design` 字段不校验协议就进入前台 `href`；`links` 只在写入时校验，旧行渲染时不复核。配合 S-1 可形成存储型 XSS。                                                                                                                                                     | 已修（渲染侧） |
| S-3 | M      | 格式错误的请求体在 try 之外抛出，返回不带 CORS 头的 1101 页面（旧 WRK-9）。                                                                                                                                                                                         | 已修           |
| S-4 | M      | Actions 缓存里有全部源图（含 Hidden），fork PR 的工作流能否读到 base 分支缓存未离线证实。                                                                                                                                                                           | owner          |
| S-5 | M      | `dev:admin` 在本机起一个不鉴权、连着生产 D1/R2 的 worker；S-1 的修复挡住普通跨站页面，DNS rebinding 仍未覆盖。                                                                                                                                                      | 部分           |
| S-6 | L      | 源图 GET 信任 R2 里存的 Content-Type，API 响应无 `nosniff`；后台没有 `X-Frame-Options` / `frame-ancestors`。                                                                                                                                                        | 待修           |
| S-7 | L      | 上传大小上限在整个 multipart 读入之后才检查；文本字段无长度上限。                                                                                                                                                                                                   | 待修           |
| S-8 | L      | 仓库内仍有可把站点关联到个人身份的字符串与日志输出（旧 PRIV-2 的延伸）。具体位置不在公开文档里列出。                                                                                                                                                                | owner          |

S-1 的修复：worker 入口对非 GET/HEAD/OPTIONS 的 `/api/admin/*` 请求检查 `Origin`，既不是 worker 自身源、也不是「本地页面对本地
worker」的一律 403；不带 `Origin` 的客户端（curl、service token）不受影响。S-2 目前只在前台渲染侧过滤非 http(s) 值；是否在写入时
也拒绝，取决于 `design` 是否本来就应当是 URL（后台字段是自由文本），属 owner 裁决。

已检查无问题：SQL 全部参数化；R2 key 服务端生成且校验路径字符；外呼地址固定；`workers_dev` / `preview_urls` 均关闭；后台无
`dangerouslySetInnerHTML`；前台 `?q=` 不进 HTML sink；Hidden 作品在列表、RSS、搜索索引之前已过滤；工作流无 `pull_request_target`、
无不可信插值；仓库与历史里没有密钥。

只能在平台核实（owner）：Access cookie 的 SameSite 与 binding cookie；Access 策略是否覆盖 `/api/admin/*`；Cloudflare token 是否
拆分为 web 与 admin 两个最小权限 token（旧 CI-1）；dispatch token 的范围；外部贡献者工作流的审批策略；secret scanning 与 push
protection（旧 CI-9）。

## 3. 重复与死代码

### 本轮已清理（行为不变，视觉基线零变动；净减约 1300 行）

- **admin**：裁剪几何去重（局部坐标投影、放松轴、旋转后重适配收进 `imageCrop.ts` 并补单测）；创建表单提示状态合并；
  Create / Aliases / Suggestion 三个页面复制粘贴的加载逻辑收成 `hooks/useAdminResource.ts`；删除纯透传的
  `AdminEditDashboard`；`AdminAliasesDashboard` 三份 tab / panel JSX 改为配置表；删除 `closeAllCharacterOpen`、
  `buildCommissionToCharacterMap`、`collectMatchedCharacterIds`、`SelectGroup` / `SelectLabel` / `SelectSeparator`、
  `postAdminJson`、永远为 false 的 `disableDrag` 路径、与 `isDeletePending` 重复的 `deletingId`，以及无人传入的
  `hideDelay`、`pendingLabel`、`linksRows`、`accept`、`attempts` 等参数。
- **worker / domain**：删除四个死导出与 `SavedSourceImage.targetKey`；删除永远走不到的 CRUD 层
  `GET /characters/:id/commissions`；`parseSuggestionRows`、`getSourceImageMimeType`、`CharacterStatus` 改用唯一实现；
  错误 / 成功信封收成 `failureFrom` / `success`；四个批量写分支改为路由表；`json` / `failure` / `parseIdFromPath` /
  `resolveD1Database` / `queryRows` / `queryFirstRow` 各留一份；domain barrel 去掉 15 个无人导入的再导出。
- **web**：删除 `lib/utils/hash.ts`、`getBaseFileName`、`format.ts` 的 `readable` 分支、`homeLocale.ts` 里 29 个无人读取的
  键（×3 语言）、`surpriseMe*` 文案、`data/` 下无人导入的导出、批次加载器遗留的 body 级 MutationObserver 与 `<template>`
  递归；`CommissionEntries` / `IllustratorInfo` 无人传入的 props 与死分支；搜索模型里 React/cmdk 移植残留的常量输入、
  无人读取的输出与 skip-DOM 路径；locale 归一、map 构建、`CharacterNavItem` 的重复副本；过时注释。

### 仍待清理

- **分叉在 domain 之外的逻辑**：`buildPopularKeywordPoolFromSuggestTexts`（web 与 worker 各一份，属产品契约：后台 Suggestion
  选项与前台回退池必须同序）；`dedupeKeywords` / `normalizeKeyword` 仍有四份（web、admin、worker、导出脚本）；D1 `links`
  JSON 解析三份；UUID 正则四份；`sortCommissionsByDate` 在 web 有一份 domain 私有函数的副本。
- **worker**：运行时 DDL（`ensure*Table` 在写路径前执行 `CREATE TABLE IF NOT EXISTS`，其中 `source_images` 的 DDL 停留在
  迁移 0002、缺 `commission_id`，与「假定全部迁移已应用」的规则矛盾，且每次写入多一次 D1 往返；删除前需确认远端 schema，
  owner）；三个只差配置的别名批量保存；日期与 work-group 校验在 API 层和持久化层各写一遍；wrangler 调用与下载重试在三个
  脚本里各写一份。
- **admin**：源图 URL / 预览版本读写在三个文件里；「成功状态自动清除」effect 三份；`globals.css` 里 coarse 指针的裁剪手柄
  偏移规则写了两遍（动它需要跑视觉回归）；永远不成立的 `typeof window` 判断。
- **web**：`apps/web/data/*` 把同一段「dev 每次重读、生产缓存」写了 9 遍；单订阅者的「订阅中心」
  （`commissionSearchPanelState.ts`、`search/commissionViewMode.ts`），归档可见性一次收起广播两遍；侧栏与汉堡菜单的视图
  切换、角色链接点击、`sidebarNavUsed` 追踪各实现一遍；选中态由 JS 切 class 三份（改成 `aria-pressed` 驱动 CSS 可同时消掉
  F-4）；侧栏 4 套 rAF 调度样板；`HomePage.astro` 两段相同的别名 map；条目锚点 id 拼了四处；`HomeClientScript.astro` 重写了
  一遍 `bindSoftNavMount`；`data-search-text` 只在 dev 输出，生产环境里 DOM 回退索引是空文本；首页三个 locale 页面重复传
  `canonicalPath`。

## 4. 架构与 CI

| 项             | 结论                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 依赖边界       | 无违规方向。唯一不一致：worker `src/` 用相对路径导入 domain 源码，`scripts/` 用包名。                                                                            |
| domain 导出面  | 连贯，不要把只被一个 app 用的导出挪回去。问题在反方向（§3 的分叉）。                                                                                             |
| worker 路由    | if 链 + 成对正则；建议抽 `http.ts` / `d1.ts` 两个小模块，再考虑路由表。保留可注入 backend 的测试接缝和文档记载的校验顺序。                                       |
| 大文件         | `CommissionManager.tsx` 混了三个状态机，可抽出「按角色懒加载」和「搜索覆盖层」两个 hook；`search.ts`、裁剪模块、web 的几个挂载闭包保持现状。                     |
| 导出入口       | 发布流程走 admin-worker 的 wrangler 配置，而根 `AGENTS.md` 说走 web 的「只读绑定」；两份配置绑定相同，所谓只读只是约定。二选一并改文档。                         |
| typecheck 覆盖 | `config/*.ts`、`scripts/`、`apps/admin/playwright.ui.config.ts` 不在任何 typecheck 内（旧 CI-10）；会删数据的 `listR2Orphans` 没有测试（CI-11）。                |
| CI             | PR 不跑 `astro build`（CI-3）；无 `timeout-minutes`（CI-6）；部署后无冒烟检查（CI-7）；过期候选静默 `exit 0`（CI-5）；action 未 pin SHA（CI-2）。                |
| 文档漂移       | `open-issues.md` 的「最后核对」日期、UTC+14 是否 owner 认可、branch protection 是否可核验，与 `AGENTS.md` 互相矛盾；`HANDOFF.md`（10-11）应并入后删除（owner）。 |

## 5. 前台性能

依据 2026-11-06 的本地 `dist`（真实数据导出，web 源码此后未变）和源码；gzip 为本地 `gzip -9`，brotli 换算与各项收益均为估算，
需按本节末尾的三项实测确认。基线：`index.html` 607 KB / 55 KB gz，4132 个元素（142 件作品在两个视图面板里各渲染一遍）；首屏
JS 约 19 KB gz；CSS 约 11.6 KB gz；4 个预加载字体共 94 KB；图片均为 WebP，768w 平均 35 KB，1280w 平均 72 KB。

| ID   | 问题                                                                                                                                                         | 改法                                                                              | 风险 / 备注                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------- |
| P-1  | 旧 BLD-1：DPR 3 手机（390px × 92vw × 3 ≈ 1077px）每张图都取 1280w，含 LCP 图。                                                                               | 宽度阶梯加一档约 1080（img 与 preload 共用常量）。                                | 改像素与 `AGENTS.md` 的宽度规则，owner        |
| P-2  | 4 个字体预加载与 LCP 图抢带宽；600 字重首屏只有年龄门按钮用。                                                                                                | 预加载去掉 600 字重。                                                             | 低；首访年龄门按钮文字可能可见换字体          |
| P-3  | 旧 WEB-12：每次访问都在空闲时下载搜索 controller（14.8 KB gz）和完整索引（8.2 KB gz）并解析；不支持 `requestIdleCallback` 的浏览器上回退为 `setTimeout(1)`。 | 索引改为首次交互或带 `?q=` 时才取；回退延迟拉长。                                 | 低-中；冷缓存下第一次输入要等一次请求         |
| P-4  | 图片骨架的 pulse 动画在图片加载后仍无限运行，默认视图约 90 个常驻动画。                                                                                      | `not-data-loaded:before:animate-pulse`（`data-loaded` 已由 `imageFadeIn` 设置）。 | 低                                            |
| P-5  | reload 时整个列表在模块链跑完前保持不可见，且没有兜底；前面的关键挂载一旦抛错页面永久空白（与 F-2 叠加）。                                                   | 给隐藏规则加 CSS 兜底（约 1.5s 后强制恢复不透明）。                               | 低                                            |
| P-6  | 隐藏的时间线面板把全部条目再渲染一遍：约 19 KB gz、42% 的 DOM。                                                                                              | 首次切换时在客户端按时间线顺序克隆。                                              | 中-高；违反静态列表契约与 10-25 的裁决，owner |
| P-7  | 旧 WEB-13：一次关键词点击在同一帧跑 2–3 次完整 recompute。                                                                                                   | 保存 rAF id 去重，teardown 时取消（同时解决 F-1 的一部分）。                      | 低                                            |
| P-8  | 首屏包静态导入了全部延迟挂载的功能（汉堡菜单、侧栏增强、滚动揭示等）；入口 chunk 的小依赖没有 modulepreload。                                                | 延迟组改成一次动态 `import()`；小模块内联或加 modulepreload。                     | 低                                            |
| P-9  | 每条目标记冗余：class 内的换行空白、`data-commission-search-key`、与 img alt 重复的 `data-commission-alt`。gzip 后合计约 4 KB。                              | 折叠空白最安全；删属性属于 DOM 契约变更。                                         | 低-中                                         |
| P-10 | body 级 MutationObserver（批次加载器遗留）在每次建议渲染时触发；滚动深度统计每帧重新扫描面板。                                                               | 删除前者；后者改 IntersectionObserver。                                           | 低                                            |
| P-11 | `/ja/`、`/zh-tw/` 不匹配 `_headers` 里的 `/` 与 `/*.html` 规则，走平台默认缓存头。                                                                           | 补两条显式 no-cache 规则；先 `curl -I` 看实际响应头。                             | 未证实                                        |

未发现问题：统计脚本空闲注入且不阻塞；滚动监听均为 passive 且按 rAF 合并；所有图片有宽高，字体 `swap` 并带度量回退；只动画
transform / opacity；`content-visibility` 已在 10-25 的计划里被否决，不建议。

需在真实浏览器里量的三项：（1）DPR 3 的 iPhone 冷缓存下 LCP 图取了哪一档、与字体预加载的先后，以及 `requestIdleCallback` 是否
存在；（2）Chrome 4× CPU 下滚到底后仍在运行的 pulse 动画与图层数；（3）无交互会话里搜索 controller 与索引是否被拉取，以及点一次
关键词时 recompute 的次数与 INP。动 P-6 之前先看时间线视图的实际使用占比。

## 6. 后台首页

用 fixture 数据截图核对（桌面 1440、手机 390）：

- 「Manage content」的四个入口与侧栏导航一一重复，手机上占掉首屏。
- Latest / Most wanted / Popular 三个榜单用同一种带缩略图的行，各 10 条纵向堆叠：桌面全页约 2900px，手机约 3700px；行不可点击。
- 右栏只有发布卡和四行统计，其下留白两千多像素；`Alias rows`、`Suggestions` 两个数字信息量低，别名明细在
  `Connection details` 里又出现一次。

建议方向（需 owner 看过对比预览后决定，不直接改）：去掉「Manage content」；统计压成一行；三个榜单合并为一个可切换的面板，或宽屏
三列、每列 5 条。

## 7. 10-12 审计条目现状

- **已修**：PRIV-1；WRK-1 / 2 / 5 / 10；WRK-3、WRK-9（本轮）；WEB-9 / 11 / 5；随批次加载器删除失效的 WEB-1 / 2 / 3 / 6 / 15 / 16 / 17。
- **部分**：WEB-4（延迟挂载已隔离，关键挂载仍有未保护的 storage，见 F-2）；BLD-5；CI-10；CI-11。
- **仍未修**：ADM-1 … ADM-11（ADM-8 在 UI 上不可达，ADM-11 已作为契约接受）；WRK-4（已作为已知行为接受）、
  WRK-6 / 7 / 8 / 11 / 12 / 13 / 14；WEB-7（controller 部分）/ 8 / 10 / 12 / 13；BLD-1 / 2 / 3 / 4 / 6 / 7 / 8；
  CI-1 / 2 / 3 / 4 / 5 / 6 / 7 / 9 / 12 / 13；PRIV-2。
