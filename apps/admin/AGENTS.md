# admin

Standalone admin frontend: React 19 + Vite 8 SPA served from `admin.crystallize.cc`.

## Responsibilities

- Talks only to admin worker API via `ADMIN_API_BASE_URL`
- Default dev: `pnpm run dev:admin` from repo root (pairs frontend with local worker + remote D1/R2)
- Preserve existing admin visual design, spacing, typography
- Where admin uses shadcn/Radix primitives, preserve them (don't downgrade to native controls)

## Key Structure

- `src/App.tsx` — path-based page routing
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
- Mutations use a single-attempt request unless the API adds an explicit idempotency contract.

## Create/Edit 布局与状态

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
- Hidden 是提交时应用的作品属性，独立放在可见性设置行；保存/删除放在操作区。属性不能混进危险操作组，原图替换仍贴近图片预览。
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

- 首页按维护入口、汇总、发布、最近作品分区；API origin、health 响应、别名细分和手动刷新保留在连接详情中。首页发布按钮取代浮动入口，不能同时显示两个发布按钮。
- 发布入口必须订阅 `websiteRebuild` 的同一个请求和 pending 状态；切换路由或卸载组件不能解锁第二次 dispatch。成功提示短暂显示，错误保留且可重试。通知和发布浮窗共用 `FloatingNotice` 的页面堆叠，始终位于模态遮罩下。
- `markPendingRebuild` 每次保存递增 revision，即使待发布标记已为 true。发布请求捕获 revision，成功仅清除该快照；等待期间的新保存必须继续显示待发布，不能无条件清空。
- Suggestion 保留最多六项、大小写归一去重、拖拽及键盘按钮排序、移除、词池筛选和手动添加。已选顺序与词池分区，手动输入 Enter 只添加，筛选输入 Enter 不提交表单；显式保存才提交。首个响应初始化列表，后台刷新不能覆盖 dirty 草稿。
- Alias 三个 tab 保持挂载，切换不丢草稿，仍保留键盘导航和入场动画。`AliasPanel` 以最新服务端行作为未编辑字段的 baseline；刷新新增的行不能被初始化空草稿覆盖。只提交 dirty 行，空字符串仍表示显式删除，未提交行不受影响。作者保留全部 aliases，不能只取第一项。
- Alias 筛选基于稳定 baseline，不能在编辑命中别名时让当前行消失并夺走焦点。每次保存成功都通知、标记待发布并刷新；错误保留草稿。分类说明、筛选、字段和底部操作区共用外边界，字段标签内缩 4px。
- `KeywordReplacePopover.tsx` 保留文件名，但交互使用 Dialog；查询字段和底部操作区固定，预览区独立滚动。提交完整 metadata，保留分篇；部分成功要更新列表和待发布状态，重试仅处理未成功项，失败详情不能被自动刷新清掉。

## Guardrails

- Route paths rooted at `/` on `admin.crystallize.cc` — no `/admin/*` public-site coupling
- Validate every migrated page with Playwright visual regression
- Validate admin pages with Playwright visual regression
