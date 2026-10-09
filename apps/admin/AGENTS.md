# admin

Standalone admin frontend: React 19 + Vite 8 SPA served from `admin.crystallize.cc`.

## Responsibilities

- Talks only to admin worker API via `ADMIN_API_BASE_URL`
- Default dev: `pnpm run dev:admin` from repo root (pairs frontend with local worker + remote D1/R2)
- 保持浅深色、IBM Plex Sans 与完整功能；页面采用私人收藏编辑台布局，避免重复标题和装饰性套卡
- Where admin uses shadcn/Radix primitives, preserve them (don't downgrade to native controls)

## Impeccable Context

- `PRODUCT.md` records confirmed admin users, purpose, workflows, terminology, and product constraints.
- `.impeccable/config.json` records the owner's default new-interface workflow: build directly in code.
- `.impeccable/live/config.json` targets the Vite `index.html` shell for local live iteration. CSP
  detection found no policy in this app; setup alone does not start live mode or inject a script.
- Run Impeccable helpers from `apps/admin` so context and workflow settings stay scoped to this app.
  Existing visual authority remains the implementation, this file, and local `.impeccable.md`.

**When to update:** Sync `PRODUCT.md` when users, product purpose, capabilities, or durable constraints
change. Update live configuration if the served HTML entry or development CSP changes; record workflow
defaults only when the owner chooses them.

## Key Structure

- `src/App.tsx` — path-based page routing with an explicit page for every section; all five routes are
  implemented, so do not restore legacy migration placeholders
- `src/app/sections.ts` — route definitions and metadata
- `src/app/ui.ts` — shared Tailwind class contracts
- `src/lib/adminActions.ts` — worker-backed form actions
- `src/lib/adminApi.ts` — API URL resolution and fetch helpers
- `src/lib/websiteRebuild.ts` — 首页/浮动入口共享发布状态、请求去重和结果通知生命周期
- `src/lib/pendingRebuildSignal.ts` — 待发布标记及每次保存递增的 revision，按发布快照确认
- `src/pages/` — route pages (overview, create, edit, aliases, suggestion)
- `src/components/` — migrated admin React components
- `src/components/FloatingNotice.tsx` — 页面/模态各自的浮动通知容器，Portal 输出不进入表单文档流
- `src/components/AdminBootstrapStatus.tsx` — 仅在读取失败时提供完整错误与重试，正常后台刷新静默
- `src/components/image/ImageCropDialog.tsx` — shared create/edit crop dialog, output status,
  compact fallback tools, and JPEG save lifecycle
- `src/components/ui/dialog.tsx` — shared Radix dialog behavior; the `alert` variant preserves the
  legacy character-delete dialog's appearance and entry animations while adding focus management
- `src/components/image/ImageCropWorkspace.tsx` — Cropper.js bridge for frame handles, image
  gestures, free rotation, touch transforms, and editor snapshots
- `src/lib/imageCrop.ts` — 1280×525 crop contract, rotated-polygon boundary model, selection
  fitting, and one-pass 95%-quality JPEG export

## Source Image Editing

- Create and replacement uploads share `ImageCropDialog`; keep both entry points behaviorally aligned
- The crop frame keeps the `1280:525` ratio but its four edges/corners are directly resizable;
  dragging the image moves it, wheel/pinch zooms it, and two-finger twist or the rotation handle
  continuously rotates it
- Cropper.js owns pointer/touch recognition and selection handles; `imageCrop.ts` remains the geometry
  authority because library bounding boxes do not prove that a rotated image covers every crop corner
- Rotation preserves the user's preferred frame width when possible and otherwise fits the largest
  valid frame at its current center; the 2-output-pixel bleed is part of every coverage calculation
- Keep the crop Dialog free of scale-based opening animations because the crop workspace measures its
  container on mount; the crop-only overlay uses the main site's glass treatment without changing
  default/sheet dialog overlays
- 裁剪框先切换关闭状态，待 Radix 退场完成（`onCloseAutoFocus`）后再调用取消/确认回调，避免父表单提前卸载；减少动态效果时不等待固定计时器。遮罩退场使用不同于入场的动画名，确保 Presence 保留节点。
- 裁剪期间禁止点击遮罩退出，避免拖动误触丢失调整；保留取消、关闭按钮和 Esc，导出期间阻止退出。内容淡入 200ms、淡出 150ms，不缩放工作区。
- A workspace resize must proportionally migrate the current selection and image matrix around the
  canvas center; never call the editor reset path from `ResizeObserver`, or an in-progress touch
  transform can be silently lost while responsive layout settles
- Object URL cleanup must survive React StrictMode's effect replay: defer revocation and cancel that
  pending cleanup when the effect is immediately re-established; still revoke on real unmount
- R2 receives only the processed `1280×525 image/jpeg` file; transparent input pixels are flattened
  onto white and low-resolution crops must surface an upscaling warning

## API Documentation

Before touching fetch logic or form actions, read:

- `docs/api-reference.md` — endpoint signatures and field types
- `docs/ai-agent-guide.md` — retry strategy, links encoding, `hidden` field quirks, alias batch semantics

## Commission Identity

- Create and edit forms use explicit `commissionDate` (`YYYY-MM-DD`) and optional `creatorName`;
  send an empty value for an unknown creator. Do not ask the caller to edit or supply `fileName`.
- Use the numeric commission ID for image preview and replacement at
  `/api/admin/commissions/:id/source-image`.
- Date/creator edits are metadata-only and must leave the source-image object unchanged. Only
  the explicit replace-image action may change the image reference.
- Show the opaque `publicId` as the user-facing identity; the integer `id` remains an internal
  relationship key for image APIs and sorting. Keep legacy `fileName` out of forms and public URLs.
- UUID 的可见摘要统一使用 `formatCommissionPublicId`，去连字符后只显示 7 位。缩略卡片第一行仅日期/作者，第二行 Links 数量左、短 ID 右，同为灰色；编辑弹窗将短 ID 放在头部角色信息行右侧，只显示一次，不能塞进可能截断的主标题或 Links 表单。完整 UUID 保留 title/无障碍名称，不能用截断文本作真实身份或 API 键。
- New work may be standalone or assigned a work group and positive part number. Never infer a new
  relationship from a matching artist, date, character, or source link; only explicit selection
  changes the group. A work group does not merge its commission records or images.
- Unknown creators display as `Anon`. The shared create/edit date picker uses the same Radix
  popover, ISO date value, aligned label/control spacing, and keyboard-accessible calendar behavior.
- 日期面板打开时定位并聚焦已选日期，空值/无效日期定位今天；Today 按钮明确选择本地今天并关闭。打开面板不修改输入值，每次打开和选择 Today 都重新计算本地日期，避免跨午夜沿用挂载时的今天。
- Mutations use a single-attempt request unless the API adds an explicit idempotency contract.

## Create/Edit 布局与状态

### 2026-09-30 设计结构

```text
src/components/AdminLayout.tsx       主内容 landmark、跳转链接、五页统一外壳
src/components/AdminSectionNav.tsx   桌面 208px 侧栏、移动完整五项导航
src/app/ui.ts                       共享单层表面与输入框契约
src/styles/globals.css              黑白灰语义颜色、覆盖层毛玻璃与实底降级
src/components/create/AddCommissionForm.tsx 图片预览、上传、记录信息与保存
src/components/edit/SortableCharacterCard.tsx 状态文字、响应式角色头与匹配骨架
src/components/edit/SortableDivider.tsx 归档分界与数量
```

- 侧栏从 1024px 开启，短窗口允许独立滚动；移动导航不隐藏任何目的地。内容保留 window 滚动，不能引入第二个主内容滚动容器破坏 Edit 锚点恢复。
- 背景、面板、导航分别使用 `--admin-canvas` / `--admin-surface` / `--admin-nav`，采用 Vercel 风格黑白中性灰。导航、顶部吸附保存条和浮动通知可使用高不透明度毛玻璃，正文和图片保留实底；不支持 backdrop-filter 或要求减少透明度时退回实底。主保存按钮至少 44px。
- 五页统一 1600px 外壳（含 padding），标题、分隔线与主要表面共用左右边界，切路由不得重新居中或改变页宽。只在内部调整图片/字段列宽，Create 桌面预览列上限 24rem。桌面顶部 32px，无重复眉题；不按 devicePixelRatio 改字号或断点。
- 图卡与骨架共用 `gridStyles` 和 `thumbnails` 容器断点：默认 2 列，40/62/78rem 起为 3/4/5 列；标题 14px/20px 行高、辅助信息 12px/16px 行高，骨架分别保留 20px/16px。rem 断点随文字放大降列，加载前后必须几何一致。
- Create 裁剪前后保留固定比例预览区域；URL 在 effect 中按当前 File 创建并释放，StrictMode 重放重新生成 URL，不复用已回收地址。1280×525 JPEG 契约及图片输入值保持不变。
- Edit 搜索使用原生 searchbox 语义；角色展开按钮、改名输入、管理操作是独立交互元素。桌面与移动均提供排序模式和上下按钮，跨 active/archive 分界按相邻列表项移动，不能跳过分界导致空分组无法进入。
- 角色状态只标记例外：Active 不显示任何标记；Archived 角色名降为灰色（`text-gray-500 dark:text-gray-400`），并在名称后显示 `IconArchiveFilled`（`data-character-status-icon`、`role="img"`、Archived `aria-label` 与 `title`）。不只依赖颜色：分界位置区分两组，持续存在、`aria-describedby` 引用的 `data-character-status-label` 文本（sr-only）为展开按钮与改名输入提供 Active / Archived 状态描述。长名截断时名称 `min-w-0 truncate`、图标 `shrink-0` 保持可见。内联改名时不渲染图标但保留该文本。Archived 表示公站默认折叠的角色，不等于隐藏/删除或缓存过期。状态按分界位置即时计算，不能在排序后读取旧角色快照。分界显示 Archived 数量，保留 `data-stale-divider` DOM 契约。
- 角色头及初始占位共用布局契约；`thumbnails` 容器小于 16rem 时，姓名/状态与计数/操作分排，文字放大时不得挤压状态。导航顶部品牌/公站链接允许换行；关键词替换入口以 max-width 和文案换行适配窄栏，不裁掉文字。
- 改名的保存/取消指针操作不能先触发 blur 提交；只有当前编辑行的两个操作带 rename 标识，切到别行仍按既有失焦保存规则处理。
- 改名请求携带本地编辑会话身份；旧响应不得关闭后续草稿或覆盖其反馈。当前失败保留草稿供明确重试；改名与排序共享角色写入序列，避免改名 PATCH 中的旧 status 覆盖后续归档。排序仍合并为最新 payload；在途改名期间恢复原名也须排队提交，不自动重试写入。
- 排序写入在途时，bootstrap 仅合并角色元数据及新增/删除，保留本地顺序与归档分界；改名不能抢先触发旧排序刷新。最新排序成功或失败后立即解除保护，使用最新 onDataChanged 刷新本 tab；不能长期等待匹配回显而忽略外部新顺序。
- 主工作区与共享字段使用命名容器查询分栏（`workspace` / `fields`），不能仅依赖 viewport 判断可用空间；200% 字体时回归单列。保存按钮有最小宽度而非固定宽度，禁止裁掉放大后的文案。
- Create 的 React 自动表单 reset 只在业务成功时生效，并清除已保存图片预览；业务失败保留文件与字段草稿，选择非法图片不得替换先前确认的有效图。

```text
src/components/
  FloatingNotice.tsx           页面 fixed / 弹窗 absolute 的通知边界
  AdminBootstrapStatus.tsx     bootstrap 读取错误与重试
  FormStatusIndicator.tsx      保存结果的通知生命周期
  create/
    CommissionSharedFields.tsx 共用表单宽度与分区
    CommissionFormFields.tsx   稳定占位、统一标签、显式分篇开关
    DuplicateCommissionNotice.tsx 仅有疑似重复时显示可展开浮窗
  edit/
    CommissionManager.tsx      浏览/搜索、局部读取和作品状态
```

- 禁止用空白状态槽或常驻 `min-height` 提示行解决漂移。普通后台刷新不提示；保存/上传/重复提醒走脱离文档流的通知。成功可自动消失，错误需用户关闭或成功重试，详情必须可键盘访问。
- 页面通知在模态遮罩下；模态通知放在其内容内部、滚动 body 外，保持焦点约束。通知空闲时不产生表单节点，也不能遮挡到无法关闭自身。
- `Select character` 在加载前后保持同一占位。loading、unavailable 和成功后确实为空必须区分，不能在请求完成前显示“没有角色”。
- 每个表单分区使用同一外部左右边界，标签统一内缩 4px；按钮区用分隔线和显式间距与字段分开。不得靠多套嵌套 padding 对齐局部字段。
- Hidden 是提交时应用的作品属性，与 Part 勾选共用可换行的紧凑选项行；不显示多余说明、不另建底部分区。分篇详情展开后仍占整宽，保存/删除保留在操作区；原图替换贴近图片预览。
- 分篇是低频显式选项：勾选后才显示组/编号，已有分篇初始勾选。取消后不提交编号，重新勾选恢复当前草稿的组/编号；文件名推断不自动启用分篇或覆盖已选择的组。
- 新增角色使用次级 Dialog，作品表单保持挂载。保存后显式刷新当前 tab 的 bootstrap；跨 tab 的 `notifyDataUpdate` 会忽略本 tab，不能用它代替本地刷新。当前创建接口无新 ID 响应，不按名称猜测并自动选择角色。
- 保留现有页面入场、分组展开、按钮和弹窗动画；漂移应修数据/布局根因，不能通过删除动画规避。正常动效与 reduced motion 均需验收。
- 浏览组占位卡数量/尺寸匹配 bootstrap 计数，失败提供局部重试；搜索直接使用 bootstrap，点击结果才读取完整记录，不能通过自动展开若干角色模拟搜索。
- 数据未就绪时不得用空角色列表清除持久展开状态。恢复滚动需等待所需数据和有限动画，按作品/角色锚点单次恢复；等待期间用户输入立即取消。
- 保存/删除即时更新搜索内容；批量关键词修改定向刷新 bootstrap 与已加载分组，不整页 reload，刷新期间保留查询、旧网格、展开与焦点。过期读取结果不可覆盖后续编辑。
- 旧网格保留只为稳定展示，不代表缓存可编辑。刷新中的组、批量变更后的组必须等待最新详情；失败提供重试，不能用旧关键词/分篇快照覆盖已成功的修改。
- 每次保存成功都需要通知并标记待重建，不能只观察 `status` 从其他值变为 success。Edit 列表回写必须使用提交快照，不能读取等待响应期间继续修改的草稿；新分篇组在请求前生成一次 UUID，后续保存复用真实组身份。
- 关键词批量替换须回传完整 metadata，尤其是 `workGroupId` / `partNumber`，不能省略或清空分篇。部分成功也要刷新数据并标记待重建，重试只处理未完成项，错误面板保留。
- 保存响应不得重新打开已关闭或已切换作品的编辑框；上传和删除的 pending 必须等待 Promise 完成，禁止同时提交互相冲突的操作。
- SPA 路由由 `App` 在页面 commit 后恢复滚动，Edit 通过 `onReady` 等展开数据和有限动画完成；reload 的存储锚点由 Edit 自身处理，两条路径不能互相竞争。
- `history.scrollRestoration = 'manual'` 仅由 Edit 持有，其他路由刷新保留浏览器恢复能力。离开页面时优先保存 `beforeunload` 的稳定锚点，`pagehide` 仅作兜底；卸载阶段字体可能变化，不能重复量测并覆盖正确快照。

本轮结构只改变 Admin 展示与交互，未改变 Worker API、schema 或裁剪输出契约。

## 其余维护页面与发布

```text
src/
  pages/AdminOverviewPage.tsx          维护入口、汇总、发布操作和折叠连接详情
  components/AdminSuggestionDashboard.tsx  已选顺序、词池筛选与手动添加
  components/AdminAliasesDashboard.tsx  三类 tab 的导航和数据适配
  components/AliasPanel.tsx            别名筛选、行级草稿与差量提交
  components/edit/KeywordReplacePopover.tsx  关键词批量替换 Dialog
  components/FloatingRebuildButton.tsx  非首页的浮动发布入口
  lib/websiteRebuild.ts                跨路由共享发布请求与结果
  lib/pendingRebuildSignal.ts          待发布标记和修改 revision
```

- 首页桌面主列放维护入口与最近作品缩略图，辅助列放发布与紧凑统计；移动端发布优先于异步列表。API origin、health 响应、别名细分和手动刷新保留在连接详情中。首页发布按钮取代浮动入口，不能同时显示两个发布按钮。
- 发布入口必须订阅 `websiteRebuild` 的同一个请求和 pending 状态；切换路由或卸载组件不能解锁第二次 dispatch。成功提示短暂显示，错误保留且可重试。通知和发布浮窗共用 `FloatingNotice` 的页面堆叠，始终位于模态遮罩下。
- `markPendingRebuild` 每次保存递增 revision，即使待发布标记已为 true。发布请求捕获 revision，成功仅清除该快照；等待期间的新保存必须继续显示待发布，不能无条件清空。
- Suggestion 保留最多六项、大小写归一去重、拖拽及键盘按钮排序、移除、词池筛选和手动添加。已选顺序与词池分区，手动输入 Enter 只添加，筛选输入 Enter 不提交表单；显式保存才提交。首个响应初始化列表，后台刷新不能覆盖 dirty 草稿。
- Suggestion 用序号与分隔行表达显示顺序，保留六行容量工作区；词池独立滚动，手动添加归属于词池。加载或添加词不推动保存位置。
- Alias 三个 tab 保持挂载，切换不丢草稿，仍保留键盘导航和入场动画。`AliasPanel` 以最新服务端行作为未编辑字段的 baseline；刷新新增的行不能被初始化空草稿覆盖。只提交 dirty 行，空字符串仍表示显式删除，未提交行不受影响。作者保留全部 aliases，不能只取第一项。
- Alias 筛选基于稳定 baseline，不能在编辑命中别名时让当前行消失并夺走焦点。每次保存成功都通知、标记待发布并刷新；错误保留草稿。分类说明、筛选、字段和保存工具栏共用外边界，字段标签内缩 4px。
- Alias 采用原名/别名双列，显示匹配数量和未保存数量；保存工具栏位于筛选与表格之间并顶部吸附，不能底部吸附与通知栈重叠。字段 scroll-margin 为工具栏保留可见焦点空间。
- `KeywordReplacePopover.tsx` 保留文件名，但交互使用 Dialog；查询字段和底部操作区固定，预览区独立滚动。提交完整 metadata，保留分篇；部分成功要更新列表和待发布状态，重试仅处理未成功项，失败详情不能被自动刷新清掉。

## Guardrails

- Route paths rooted at `/` on `admin.crystallize.cc` — no `/admin/*` public-site coupling
- Validate every migrated page with Playwright visual regression
