# Admin 设计与功能排布审计（2026-09-30）

本文记录首轮设计与 42 项浏览器验收。随后按用户反馈调整 Vercel 配色、覆盖层毛玻璃与大屏密度，见 [HiDPI 验收](./admin-hidpi-review-2026-09-30.md)；最新页面边界和角色状态见 [一致性验收](./admin-consistency-review-2026-09-30.md)。下述 1040px 宽度和截图属于首轮快照。

## 反模式判定

**基线未通过本轮设计目标；当前重构已完成布局、功能保留与本地视觉验收。** 基线并非完全不可用，但窄栏、同权重按钮、重复卡片边框与大段留白，让私人作品维护工具接近通用后台模板。首页将四项数字摘要放在作品之前，最近作品又缺少图像识别线索，主次与实际维护任务不一致。

本轮方向是「私人收藏编辑台」：桌面使用固定侧栏与宽工作区，作品与编辑操作占据主位，数字与诊断退为辅助；采用浅暖中性面、克制边框和明确操作层级。保留 IBM Plex Sans、Berkeley Mono 元数据、现有动效和深浅主题。

逐项判定：

- **统计主导布局：基线存在轻度问题。** 四项统计并非超大营销数字，但占据首页主要横向分区；当前已收为辅助列的紧凑列表。
- **卡片和玻璃效果泛用：基线存在。** 多层圆角、边框、ring、阴影与透明背景叠加；当前共享表面和表单已扁平化。Aliases 保存条仍有轻微模糊，用于滚动时区分前后层，并非全页玻璃装饰。
- **重复标题与操作同权：基线存在。** 页面标题、卡片标题、说明重复；Create/Edit 入口同权。当前突出创建操作、保留编辑入口，表单标题改为真正分区名称。
- **霓虹、渐变字、装饰图表、弹跳动效：本次检查未发现。** 不为匹配风格清单而增加无用装饰。
- **等宽字体泛用：未发现。** 当前只用于 ID、计数与顺序等元数据。
- **移动端删功能：不接受。** 拖拽可由箭头操作替代，导航、维护、排序、保存、发布均须保留。

## 摘要与证据范围

审计基线为 `47c159c8d5443b44fbfa9ba8c3b5ff20cfc9a711`，实施分支为 `redesign/admin-workspace`。本报告依据基线差异、当前源码以及本地模拟 API 截图；不代表生产界面或真实数据的完整验收。

共记录 **8 项问题：Critical 0、High 2、Medium 5、Low 1**。这些计数描述本轮识别的问题，不是声称当前仍有八项未修复缺陷。每项均标明实施状态；视觉修复须与最终截图和交互结果一起验收。

最优先的四项：重命名的交互语义与取消行为、排序跨分隔线的可达性、桌面编辑空间不足、首页维护任务与统计之间的主次关系。未给出主观总分，避免用一个数字掩盖功能和验证边界。

基线证据位于 `/tmp/admin-redesign-before/`，包含 Overview、Create、Edit、Aliases、Suggestion 五类场景及桌面/窄屏截图。最终对比入口为 `/tmp/admin-redesign-review/index.html`，其 `before/` 与 `after/` 保留两轮证据；临时目录不受 Git 管理。主线程已查看五页面截图及深色、移动和文字放大场景；报告依据截图、几何断言和业务测试共同验收。

设计依据：`.impeccable.md`、Impeccable 的 `audit` 和 `frontend-design` 技能。目标用户是站点维护者，核心流程为选择作品、精确修改、保存、继续；本轮不改为营销站式首页。

## 分级发现

### Critical：无已证实问题

本次未发现必须通过移除功能才能解决的阻断问题。该结论不等于完成 WCAG 认证、生产安全审计或穷尽全部异常路径。

### High

#### D01：角色重命名混入展开按钮，取消与失焦保存冲突

- **定位：** `apps/admin/src/components/edit/SortableCharacterCard.tsx`，名称编辑区域、`onBlur` 及保存/取消按钮；当前约第 120–150、200–280 行。
- **类别：** 无障碍、交互正确性。
- **基线问题：** 名称输入放在按钮内部，展开、输入与行级动作边界不清；取消动作可能先触发输入失焦保存，违背「取消」语义。
- **影响：** 键盘与指针操作结果不一致，用户可能把本想放弃的名称写入服务端。
- **标准关联：** HTML 交互内容嵌套约束；WCAG 4.1.2 的名称、角色、状态与 2.1.1 键盘操作。这里不据静态代码宣称整页 WCAG 合规。
- **修复与现状：** 输入与展开按钮成为独立分支；输入提供名称，展开按钮保留 `aria-expanded` / `aria-controls`。保存/取消明确区分焦点行为，取消指针操作阻止不必要失焦。单测覆盖按钮外输入、键盘取消、指针取消和跨行失焦保存。编辑会话隔离旧响应，失败保留草稿；改名和排序共享写入序列，避免旧 status 覆盖归档，在途请求期间恢复原名也会提交。
- **验收：** 最终浏览器分别检查点击保存、点击取消、Tab 到取消、Enter、Esc、离开当前角色；取消不得产生重命名请求。
- **对应技能：** `/harden`、`/clarify`。

#### D02：排序箭头不能可靠表达跨组移动

- **定位：** `apps/admin/src/components/edit/CommissionManager.tsx`，排序模式入口和 `onMoveUp` / `onMoveDown`；当前约第 488–530、629–635 行。
- **类别：** 功能可达性、响应式、无障碍。
- **基线问题：** 箭头路径试图跳过分隔线；当另一组为空时，计算目标可能越界而没有动作。排序模式按钮又仅在小屏显示，桌面主要依赖拖拽。
- **影响：** 不同输入方式无法完成同一组间移动，空分组边界尤其容易造成「按钮可点但无效果」。
- **标准关联：** WCAG 2.1.1 键盘操作；44px 目标用于触控易用性，不能把它直接等同于 WCAG AA 的最小尺寸要求。
- **修复与现状：** 所有尺寸提供显式 Reorder/Done；箭头按相邻列表位置移动，跨过分隔线自然改变 active/archived。提示直接解释跨组含义。单测核对空 archived 组的移入、移回以及提交顺序。
- **验收：** 桌面和 320px 分别完成上移、下移、跨组、空组、首尾禁用；拖拽继续有效，搜索状态不得意外修改顺序。
- **对应技能：** `/adapt`、`/harden`。

### Medium

#### D03：外层窄栏限制所有页面，导航和编辑内容共用横向空间

- **定位：** `apps/admin/src/components/AdminLayout.tsx:36`、`AdminSectionNav.tsx:14`。
- **类别：** 排布、响应式。
- **基线问题：** 外层 `max-w-2xl` 约束实际桌面工作区，即使内部组件声明更宽仍无法获得空间；顶部链接导航与页面标题持续占用首屏。
- **影响：** 编辑列表、别名双列和建议词池挤在同一窄栏，长字段换行增加，桌面没有转化为更有效的操作空间。
- **修复与现状：** 桌面 208px 侧栏、最大 1040px 工作区；小屏五项导航保持可见。增加 `main` 和跳转主内容链接。导航沿用 SPA 链接契约。
- **验收：** 320px、桌面、200% 文本放大、键盘跳转及长标签；不以裁剪内容或隐藏功能消除横向溢出。
- **对应技能：** `/arrange`、`/adapt`。

#### D04：首页统计与维护操作同权，最近作品缺少图像识别

- **定位：** `apps/admin/src/pages/AdminOverviewPage.tsx:74`，维护入口、发布辅助列、Collection 和 Latest entries。
- **类别：** 信息层级、任务效率。
- **基线问题：** 维护入口、统计、发布、最近作品依次堆叠；最近作品只有日期/作者与角色文字，难以快速确认是哪张图。
- **影响：** 用户先浏览通用数字再寻找正在维护的内容，首页与收藏型产品的实际对象脱节。
- **修复与现状：** 主列放维护入口和最新十项，辅助列放发布、紧凑统计及折叠诊断；最近项使用现有作品 ID 图片接口，延迟加载并预留尺寸。创建为主操作，其余入口保留。小屏发布在异步统计和最近列表之前。
- **验收：** 冷加载前后发布按钮位置不变；空、错误、重试、最近十项、全部维护链接及诊断可用；发布只 dispatch 一次并跨路由共享状态。
- **对应技能：** `/distill`、`/arrange`。

#### D05：创建表单完成裁剪后缺少可见的作品确认

- **定位：** `apps/admin/src/components/create/AddCommissionForm.tsx:38`、`:183`。
- **类别：** 反馈、信息排布。
- **基线问题：** 创建主要显示上传字段与文字提示；用户关闭裁剪后，需要依靠文件信息记住即将保存的图像。
- **影响：** 连续录入时难以核对当前作品，图像与 metadata 的关系不够清楚。
- **修复与现状：** 增加 1280:525 比例预览，来源为本次裁剪结果的 Object URL；图像和上传字段同区，后续分区为 Entry details。预览资源在 StrictMode 重放中重新创建并按生命周期释放。React 自动 reset 只允许业务成功时执行，失败保留字段、确认图片和预览；非法图片不替换先前有效文件。
- **验收：** 无图占位、选图、裁剪确认、取消、重新选图、成功重置；预览必须对应最终上传文件，不能展示未确认的原图。
- **对应技能：** `/arrange`、`/clarify`。

#### D06：别名保存远离长列表中的当前编辑位置

- **定位：** `apps/admin/src/components/AliasPanel.tsx:94`、`:106`、`:138`；`AdminAliasesDashboard.tsx`。
- **类别：** 任务效率、状态可见性、响应式。
- **基线问题：** 保存只在表格底部；字段编辑与保存影响范围缺少就近反馈，分类标题和卡片标题重复。
- **影响：** 长列表中要额外滚动寻找提交入口，难以判断当前有多少变更。
- **修复与现状：** 筛选后设置粘性保存工具栏，显示未保存数量与差量提交范围；字段提供变更标记，显示筛选计数，减少重复标题。三类 tab 保持挂载，草稿和服务端 baseline 规则不变。
- **验收：** 长列表和文本放大时保存条不遮挡焦点；跨 tab 草稿、作者多别名、筛选中编辑、显式清空、只提交 dirty 行、失败保留草稿全部继续有效。
- **对应技能：** `/arrange`、`/harden`。

#### D07：建议词的已选顺序和添加来源边界不够明确

- **定位：** `apps/admin/src/components/AdminSuggestionDashboard.tsx:36`、`:117`、`:150`、`:205`。
- **类别：** 排布、状态反馈、触控。
- **基线问题：** 已选词、词池和手动添加使用多层容器；顺序靠位置暗示，手动输入离词池分区较远，行级图标目标偏小。
- **影响：** 用户需额外区分「当前展示什么」「去哪里添加」「是否已保存」。
- **修复与现状：** 显式序号列表和分隔线取代嵌套卡片；词池与手动添加归于同一列；底部显示未保存状态及发布说明；排序/移除按钮改为 44px。
- **验收：** 最多六项、大小写归一去重、拖拽和箭头排序、移除、词池筛选、手动 Enter 只添加、筛选 Enter 不提交，以及刷新不覆盖 dirty 草稿。
- **对应技能：** `/distill`、`/arrange`、`/adapt`。

### Low

#### D08：表面样式重复叠加，视觉边界比任务边界更突出

- **定位：** `apps/admin/src/app/ui.ts`；`apps/admin/src/styles/globals.css:145`、`:210`；共享 Save/Submit 按钮及本轮表单容器。
- **类别：** 主题、一致性。
- **基线问题：** 圆角、边框、ring、阴影与透明度组合散落在共享和局部组件，造成弱差异却增加视觉噪声。
- **影响：** 同一层级看起来像不同设计系统，长期调整需要逐组件比对。
- **修复与现状：** 引入 `admin-workspace`、`admin-navigation`、`admin-surface`、`admin-input` 的表面约定，去除大部分装饰性叠层，收敛主按钮。局部语义色、裁剪遮罩和必要模态仍保留。
- **验收：** 深浅主题下检查输入边界、焦点、禁用、错误和浮动层。尚未测得逐项对比度，不能宣称所有文字达到 4.5:1。
- **对应技能：** `/normalize`、`/polish`。

## 系统性原因与正面保留项

主要问题是展示骨架没有围绕维护任务生长：一套窄栏与卡片样式套在首页、列表、表单和词池上；视觉上同级的操作，业务频率与风险并不相同。局部加间距无法消除这种错位，因此本轮同时调整导航、工作区和页面内部主次，而非只换颜色。

以下既有能力是本轮必须保护的基础：

- Radix 模态、焦点管理、日期控件及图像裁剪保留，不能为扁平视觉改回无状态约束的原生替代品。
- FloatingNotice 脱离文档流，保存/错误反馈不推动字段；错误可查看和关闭，模态内通知保留焦点边界。
- Create/Edit 共用字段、显式日期/作者、不可变作品 public ID、可选分篇、Hidden、链接、描述、关键词和图片替换契约。
- 搜索基于 bootstrap；点中结果才加载详情。后台刷新保留查询、展开和草稿，过期读取不覆盖后续编辑。
- 发布使用共享请求与 revision 快照，不能因路由切换解锁重复请求或清除请求期间的新修改。
- 建议词具有非拖拽排序路径，别名按差量提交且保留全部作者 aliases。
- 缩略图预留尺寸并延迟加载；本轮不引入图表库、动画库或新的状态系统。尚无性能剖析数据，不宣称加载速度提高。

## 全功能保留与证据

勾选表示本轮完成实现保留复核与对应范围的验证；每项明确区分浏览器、单测和源码证据，不表示所有异常都经过端到端测试。

- [x] **全局：** 浏览器在五种宽度和两种主题逐页跳转，检查五项导航、当前状态、主内容宽度；短窗口侧栏及键盘跳转通过。Public Site、SPA 链接和历史导航契约经源码差异复核保留；路由恢复见 `App.test.tsx`，本轮未单独新增前进/后退浏览器用例。
- [x] **主题与动效：** 五页面浅深色截图、320px 无横向溢出及 200% 文本放大通过；放大场景等待实际内容，额外检查按钮内部文案无裁切。正常动效用例与默认 reduced motion 套件均通过，通知栈间距至少 7px。
- [x] **Overview：** 维护链接、统计、最新十项上限、缩略图、空/错误/重试和诊断刷新按源码差异确认保留。浏览器验证冷载发布按钮不移动、跨路由仅一次 dispatch 和成功反馈；`websiteRebuild.test.tsx` 验证失败重试、共享 pending 与新 revision 保留。
- [x] **Create：** 浏览器验证角色加载占位、新建角色不丢草稿、重复提示、17° 裁剪输出/预览、失败保留图片与字段、重试成功重置。共享字段单测验证日期和分篇状态；全部 metadata、Hidden 和链接提交沿用既有契约。
- [x] **Edit 浏览：** 浏览器验证展开、懒加载搜索、冷/热网格几何、长列表 reload 锚点；`AdminEditPage.test.tsx` 验证缓存刷新失败与显式重试，Manager 测试验证局部读取和搜索更新。
- [x] **Edit 角色管理：** 320px/1280px 浏览器取消不写入、键盘跨 active/archive 分界通过；组件/Hook 测试验证指针与键盘取消、跨行失焦、空组移入移回、延迟响应、显式重试、恢复原名及改名/归档写入顺序。角色原生拖拽沿用原实现；删除确认和 pending 由 `CharacterDeleteDialog.test.tsx` 及 Hook 测试验证。
- [x] **Edit 作品管理：** 浏览器验证全部字段排列、分篇恢复、保存错误和短 ID 单处显示；`CommissionEditForm.test.tsx` 验证提交快照、稳定分篇身份、图片替换和删除 pending。图片替换继续复用未改动的裁剪器；关闭/切换后的响应门禁经源码差异复核保留。
- [x] **批量关键词：** 浏览器验证预览及错误过程中输入/操作位置；`KeywordReplacePopover.test.tsx` 验证完整 metadata、workGroupId/partNumber、部分成功刷新和只重试未完成项。
- [x] **Aliases：** 浏览器验证三 tab 草稿、完整作者别名、显式清空、差量请求、320px 布局；组件单测验证稳定筛选 baseline、焦点、刷新新增行和失败重试。保存条位于表格上方并顶部吸附，避免底部通知重叠；字段保留 scroll-margin。
- [x] **Suggestion：** 浏览器验证真实指针拖拽、箭头排序、手动 Enter 只添加、显式保存及固定保存位置；组件单测验证六项上限、词池移除、每次成功更新和刷新不覆盖 dirty 草稿。归一去重与词池查询经源码差异确认保留。

## 最终验证记录

- 基线：`47c159c`；交付为 `redesign/admin-workspace` 上的未提交工作区，不部署。
- 完整单测：**70 个文件 / 336 项通过**。最终使用 Node `24.21.0` 调用本地 Vitest CLI：`node node_modules/vitest/vitest.mjs run -c vitest.config.ts`。
- 全仓 ESLint 通过；四 workspace 各运行本地 TypeScript `tsc --noEmit -p tsconfig.json` 通过。包管理器签名联网核验曾挂起，因此最终使用明确的 Node 24 二进制执行本地 CLI，不将挂起的 Turbo 调用计为成功。
- Admin production build 通过：在 `apps/admin` 使用 Node 24 调用 `node node_modules/vite/bin/vite.js build`；只有既有 Radix `use client` 打包提示。
- `mise exec -- pnpm run test:admin-ui`：**42 项通过（1.1m）**。全部 Admin API 由 fixture 拦截，未启动 Worker 或写入 D1/R2。
- 浏览器矩阵：320/390/768/1280/1440px × light/dark，每项覆盖全部五个页面；另有 200% 文字、短桌面窗口、正常/reduced motion、0/6/7/30 卡片占位、冷载、错误/重试、草稿和裁剪输出断言。
- 最终截图：`test-results/admin-ui/`；对比归档：`/tmp/admin-redesign-review/index.html`。截图等待页面实际数据就绪，不用仅含标题的懒加载瞬间充当验收。
- `git diff --check` 通过；根/Admin/test 的 AGENTS 与设计上下文、任务清单同步。
- 未覆盖：生产管理员登录态、真实发布 dispatch、Cloudflare 权限/边缘行为、真实数据量性能、WebKit/Firefox/读屏。未运行依赖远端数据的旧 `test:visual` 套件；不把 fixture 套件等同于它。

## 后续操作

本轮八项发现已按上述证据收口。未来仅在实际使用发现拥挤、耗时或焦点问题时扩大优化；当前无需引入新状态库、缓存层或虚拟列表。生产发布与管理员会话验收属于后续发布工作。

## 改动文件与职责

- `apps/admin/src/components/AdminLayout.tsx`：宽工作区、主内容 landmark 与跳转链接。
- `apps/admin/src/components/AdminSectionNav.tsx`：桌面侧栏和移动完整导航。
- `apps/admin/src/app/ui.ts`：单层表面、输入框和操作样式。
- `apps/admin/src/styles/globals.css`：浅深色中性灰及表面语义颜色。
- `apps/admin/src/pages/AdminOverviewPage.tsx`：首页主辅布局和最近作品缩略图。
- `apps/admin/src/components/create/AddCommissionForm.tsx`：裁剪结果预览和失败草稿保留。
- `apps/admin/src/components/create/CommissionFormFields.tsx`：字段标签与容器分栏。
- `apps/admin/src/components/create/CommissionSharedFields.tsx`：共享分区和文字放大适配。
- `apps/admin/src/components/edit/CommissionManager.tsx`：搜索语义、显式排序与跨分隔线移动。
- `apps/admin/src/components/edit/SortableCharacterCard.tsx`：展开、改名及操作边界。
- `apps/admin/src/components/edit/CommissionThumbnailGrid.tsx`：缩略卡表面与占位几何。
- `apps/admin/src/components/edit/SortableDivider.tsx`：active/archive 的轻量边界提示。
- `apps/admin/src/components/edit/KeywordReplacePopover.tsx`：窄屏也显示完整替换入口文案。
- `apps/admin/src/hooks/useCommissionManager.ts`：改名编辑会话及角色写入顺序。
- `apps/admin/src/components/AdminSuggestionDashboard.tsx`：显示顺序、词池与手动添加。
- `apps/admin/src/components/AdminAliasesDashboard.tsx`：三类导航与匹配计数。
- `apps/admin/src/components/AliasPanel.tsx`：别名双列、变更反馈和顶部保存工具栏。
- `apps/admin/src/components/SaveButton.tsx`：保存按钮的触控尺寸。
- `apps/admin/src/components/SubmitButton.tsx`：提交按钮最小宽度与文字放大。
- `apps/admin/src/components/ui/dialog.tsx`：更新主题说明注释，模态逻辑不变。
- `apps/admin/src/components/edit/CommissionManager.test.tsx`：取消、失焦及空组排序回归。
- `apps/admin/src/hooks/useCommissionManager.test.tsx`：旧响应、失败重试、恢复原名和归档顺序回归。
- `apps/admin/test/visual/ui-stability.spec.ts`：主题/宽度/放大、裁剪预览重试和键盘/指针验收。
- `.impeccable.md`：新的收藏编辑台设计方向。
- `AGENTS.md`：全局架构和审计索引。
- `apps/admin/AGENTS.md`：组件职责、状态和响应式约束。
- `apps/admin/test/AGENTS.md`：fixture 与截图验收边界。
- `tasks/todo.md`：本轮完成清单和 Review。
- `tasks/lessons.md`：分支优先、真实视觉及文字放大检查教训。
- `docs/admin-design-audit-2026-09-30.md`：本报告与最终功能证据。

## 范围与非目标

本轮允许重写 Admin 展示与交互，成功标准是设计更合理、美观且功能完整。业务修复涉及重命名语义/请求顺序、排序可达性及创建失败时的草稿保留；其余以布局、层级、反馈和响应式为主。

不变更 Worker API、D1 schema、R2 对象身份、作品 public ID、分篇契约、裁剪几何或公开站构建流程；不删减维护功能，不直接操作生产数据，不在本报告中宣称已部署。仓库文档同步属于主线程整合步骤。
