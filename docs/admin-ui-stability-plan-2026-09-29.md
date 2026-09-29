# Admin Create / Edit 布局稳定性审计与整改规划

日期：2026-09-29。状态：整改已进入验证；初版审计证据保留，最终设计以本节修订为准。

## 实施修订：用户确认后的界面约束

1. **不保留空通知栏。** 正常 Refreshing 静默，失败/保存/上传/重复提示使用页面或当前模态角落的浮动通知。通知不存在时不占高度；错误可关闭、完整内容可展开，重试入口明确。
2. **动画保留。** 页面入场、角色展开、图片和弹窗动效延续原体验；通过数据到达时机、真实尺寸占位、取消强制滚动修复漂移，不以禁用动画通过验收。
3. **角色占位稳定。** 首屏与数据到达后均为 `Select character`，未就绪时禁用，不先显示 `No characters available`。只有成功读取后的真实空列表才提示新建角色。
4. **表单外边界一致。** Character/Date/Creator、分篇、Links、Design/Description、Keywords 共用容器宽度；标签统一内缩 4px，控件内部统一左右 padding。保存区用分隔线和间距分区。
5. **分篇按需展开。** 常驻的是一个 checkbox，勾选后显示 group/part，已分篇作品默认勾选。关闭后不提交 part，重新开启保留当前草稿；自动文件名建议不会触发隐式展开。
6. **UUID 只显示一次且缩到 7 位。** 缩略卡片的第二行左侧 `1 link`、右侧短 ID，同灰色；编辑弹窗主标题只显示日期/作者，短 ID 放头部角色信息行右侧，独立占用自身宽度、不会被主标题截断。完整 UUID 保留 title/无障碍名称。
7. **新增作品为主流程。** New character 为次级 Dialog，保存/取消保留作品草稿。角色保存显式刷新本 tab 的选择项；API 没有返回创建 ID，因此不按同名猜测自动选中。
8. **属性与操作分离。** Hidden 移到表单末尾的可见性设置，说明保存后生效；底部仅放保存和带确认的删除，主操作与危险操作分开。

初版建议中的“常驻状态槽”“常驻禁用 Part number”“删减入场动画”已由以上约束替代。动作区保留正常文档流并增加间距，不增加占屏固定保存条。

## 最终排布与功能分区复核

- **Create 主路径：** 原图上传 → 角色/日期/作者 → 按需分篇 → 来源链接与作品说明 → 搜索关键词 → 可见性 → 保存。新建角色进入独立模态，避免两个完整表单争抢主次，也不因角色保存失败推动作品草稿。
- **Edit 主路径：** 身份摘要 → 图片预览与替换 → 与 Create 相同的作品属性 → 保存/删除。主标题承载日期与作者，角色和短 ID 属于次级身份信息；UUID 不属于来源链接，因此不嵌入 Links 字段。
- **浏览与工具：** 搜索、角色排序、批量关键词工具留在列表工具栏；检索结果直接来自搜索数据，选中才加载编辑详情，不展开所有命中角色。清空搜索回到原展开状态。
- **空间层级：** 同排控件共享外边界和 44px 最小高度；标签内缩 4px、控件文字左右 padding 16px。组内间距小于分区间距，以细分隔线划分来源信息、可见性与操作，不叠加装饰卡片或状态空行。
- **反馈层级：** 保存/上传/重复提醒由当前页面或模态自己的浮窗呈现；正常后台刷新不占用视觉空间。失败保留可操作错误；列表首次读取失败替代相应列表内容，不假装成功或空数据。
- **功能保留核对：** 原图选择和替换、1280×525 裁剪与旋转、显式分篇、角色新增/改名/删除、作品保存/隐藏/删除、别名参与搜索、排序、关键词批量替换、公开重建入口均保留。此次不改变 API/schema，也不更换裁剪器。
- **运行时复核：** 单独检查连续保存、网络 pending、分篇身份和本地搜索同步，避免外观修改掩盖状态错误。代码审查与几何断言配合使用；不把禁用动画的截图通过视为完整交互验证。

保留中性主题、字体和现有 Radix 组件；此次调整信息顺序和状态归属，不另造一套视觉系统。已检查桌面暗色与窄屏截图；真实 Safari、移动软键盘和生产网络仍是验证边界，不宣称所有设备均已实测。

## 结论与设计判断

问题不是某一条 `Refreshing` 文案，而是加载、提示和表单共用普通文档流，却没有约定状态变化时哪些边界必须保持稳定。网络响应、输入匹配和定时器都能改变页面高度；叠加多层入场动画、主动滚动，形成用户感受到的“漂移”。

视觉反模式判断：不需要推翻现有品牌。中性配色、IBM Plex Sans、Berkeley Mono 和克制的控件已经适合私人内容维护工具。主要问题是两个完整表单上下堆叠、重复的卡片/说明层次，以及高频状态被当成新内容插入。改版应减少视觉噪声，保留现有 Radix 控件与图片操作习惯，不引入新设计系统。

共归纳 **14 项：P1 五项、P2 八项、P3 一项**。P1 代表优先处理的显著体验问题，不等同于生产事故；没有发现本次范围内的 P0。其中九类问题已有浏览器几何证据，其余标明静态证据或待验证。没有做全面 WCAG 合规判定，也不以主观分数替代证据。

优先顺序：稳定页头/加载外壳 → 稳定字段与反馈 → 稳定网格/搜索 → 统一滚动恢复。**不能用延时、淡出动画或大面积固定高度遮掩结构变化。**

## 审计基线与验证边界

- 开始时 HEAD 为 `7b2ecfc5600cc157c0b0d7940be3a721bb57fcb0`，工作区已有作品公开 ID、分篇和日期字段改动。审计期间其他工作推进至 `2939c7e2499c6c09c86263a3202e29385f74de48`，这些改动已被提交；本报告依据实际检查的当前组件，不将它们归入本次修复。
- 本仓主分支是 `master`，没有本地 `main`。`Refreshing`、上传 helper 字号分支、固定六张 skeleton 在初始 HEAD 已存在；分篇字段属于同时进行的迁移。此次没有业务修改，因此没有“修复前后运行已通过”的结论。
- 阅读 `.impeccable.md`、根与 Admin/test 的 AGENTS、API 文档、既有教训；Create/Edit 分别经过只读代码审查。
- 使用本地 Vite `http://127.0.0.1:4174` 与 Chromium。所有 `/api/admin/**` 请求被 Playwright 模拟，未启动绑定生产资源的 Worker，未调用生产 D1/R2。表单错误测试的 POST 同样由 fixture 返回失败。
- 模拟数据：两个角色，各一条作品；日期 `2026-09-29`、作者 `Artist`；bootstrap 与角色条目响应延迟 1400ms，图片接口模拟 404，以验证有尺寸的缺图状态。源码只读，数据变更不落库。
- 主要测量视口为 `1280×1000`、`390×844`、`320×844`，使用 reduced motion，并在字体就绪后测量交互。记录元素文档坐标 `rect.y + scrollY`，避免把 Playwright 自动滚动误算成布局变化。Edit 个别动画不尊重 reduced motion，相关尺寸在动画结束后读取。
- 浏览器测量是受控 fixture 结果，不是生产分布或跨浏览器全量回归；没有运行完整 visual suite，也没有测得生产 CLS。Safari、软键盘、200% 文字缩放和长列表恢复列入实施验收。
- 临时证据位于 `/private/tmp/admin-ui-audit/`，包括 `metrics.json` 和截图；可复跑脚本为 `/private/tmp/admin-ui-audit.ts`。这些临时文件可能被系统清理，核心数值与步骤已写入本报告。

## 浏览器复现记录

1. **冷开 Create**：数据等待卡片高 90px，最终双表单区域高 1203px。此处是区域高度差，不把 1113px 当成某个可见元素的位移或 CLS。
2. **Create → Edit，bootstrap 已缓存**：`Existing commissions` 的文档 Y 从 278 变为 246，刷新提示消失造成 **上移 32px**。
3. **展开只有一条作品的角色**：固定六张 skeleton 使角色卡高 355.06px，真实网格高 219.03px；下一角色的 Y 从 751.06 变为 615.03，**上移 136.03px**。
4. **Create 选择无效文本文件**：helper 从 `12px/16px` 字号/行高变为 `16px/24px`，Character 控件 Y 从 818 变为 826，**下移 8px**。
5. **390px 下输入匹配的日期/作者/角色**：一条重复提醒使 Save commission 文档 Y 从 1890.5 变为 2088.125，**下移 197.625px**。删去匹配条件后提醒卸载。
6. **390px 下选择 New multi-part group**：Links 文档 Y 从 1430.75 变为 1540.75，**下移 110px**。这是用户主动操作后的结构变化；风险在于自动推断分篇也会触发同一路径，以及保存区随之移动。
7. **Edit 抽屉选择无效文件**：Character 的 Y 从 514.59 变为 550.59，**下移 36px**；约 2.4 秒后错误自动消失，恢复原位。
8. **390px 下模拟保存角色的长错误**：下方 Add Commission Entry 标题 **下移 20px**；Save character 按钮从声明的 150px 宽被 flex 压缩到 **120.69px**。
9. **320px 下 Create**：视口宽 320px，文档 `scrollWidth=336px`；两张表单均宽 320px、左边距 16px，确有横向溢出。

## 问题清单

以下源码位置均相对仓库根目录；行号为审计时定位点，后续实施需按组件/符号复核。

### S01 · P1 · Edit 后台刷新改变列表起点

证据：`apps/admin/src/pages/AdminEditPage.tsx:29,132,252-290`。缓存命中初始 `isLoading=false`，effect 无条件派发 loading，普通流中插入 Refreshing 段落，完成后删除。失败时换成更高的 warning block，重试再换成短段落。

影响：每次进入缓存页面和部分数据更新都能推移整个列表；浏览器已确认 32px。最小修正是在现有页头预留状态位置，只更新该位置的内容；失败保留旧数据并提供可访问的重试入口。不要将缓存内容卸载为 loading。

### S02 · P1 · 冷启动外壳与最终页面形状无关

证据：`apps/admin/src/App.tsx:257-268`、`pages/AdminCreatePage.tsx:105-157`、`pages/AdminEditPage.tsx:295-333`。路由模块等待、数据等待、完整内容有三个不同结构；时序决定其中哪些会被实际绘制。

影响：快网闪卡、慢网突然撑高。Create 已测 90px → 1203px。改为路由与数据阶段共用页面结构：Create 尽早挂载表单，只禁用需要 bootstrap 的选择/提交依赖；Edit 保留标题、工具栏和结果边界。未知数据总量不能承诺整页高度完全相同，应保证首屏操作锚点稳定。

### S03 · P1 · Edit 固定六张 skeleton 不对应真实网格

证据：`components/edit/CommissionThumbnailGrid.tsx:190-217`、`SortableCharacterCard.tsx:315-334`。任何组先展示六张，完成后按真实数量渲染；文字占位也不是与最终两行严格等高。

影响：0/1/7/大量作品组都会收缩或扩张，已测下一组上移 136px。使用 bootstrap 已有计数与共享卡片结构确定占位数量/高度；搜索时用匹配数。大组是否分批展示应单独设计，不能先占六格再悄悄补全。图片本身已有 `1280:525` 容器，不是此次根因。

### S04 · P1 · 搜索同时展开多组，再串行替换内容

证据：`components/edit/CommissionManager.tsx:138-159,270-290,474-489,505-518`。搜索最多自动展开八组，逐组等待网络，搜索计数行也按条件插入。

影响：用户输入一次，后续多个响应持续改变页面高度。代码路径已确认，多组位移尚未量测。第一阶段保留现有分组，按匹配数占位、固定结果摘要位置；并发只能缩短等待，不能代替布局约束。完整方案使用独立搜索结果区域，直接依据 bootstrap 的命中作品渲染稳定结果壳，完整详情在选择条目时加载，避免驱动浏览模式的多组展开。

### S05 · P1 · 滚动恢复、主动滚动、异步高度相互干扰

证据：`pages/AdminEditPage.tsx:214-245` 按当前最大滚动距离截断恢复目标，可能在 skeleton 阶段就标记完成；`App.tsx:109-133,145-161` 也负责路由滚动；`CommissionManager.tsx:243-257` 开关角色时主动 smooth scroll，同时分组做高度动画。

影响：返回长列表可能恢复到暂时的底部，真实内容到达后无法回到原作品；也可能在用户操作时继续移视口。这是静态时序风险，未报告实际失位像素。统一单一滚动所有者，记录角色/作品锚点与 offset，等待相关组就绪后恢复；用户主动滚动立即取消待恢复动作。不要按 120 帧反复盲滚，也不在每次折叠时自动 smooth scroll。

### S06 · P2 · Create 上传提示更换颜色时丢失基础字号

证据：`components/create/CommissionFormFields.tsx:209-240`；触发点 `AddCommissionForm.tsx:88-91,140-147`。默认带 `text-xs`，success/error 只带颜色，继承窄屏 14px/桌面 16px。成功提示包含任意长度文件名。

影响：错误已测字段下移 8px；长文件名和成功文案可能更大，尚未量化。将字体/行高/换行策略与 tone 分离，文件名独立显示并可查看完整值；固定短摘要，预留合理反馈行，而不是固定容器后裁掉错误。

### S07 · P2 · 重复提醒按输入增删整块卡片

证据：`AddCommissionForm.tsx:68-80,206`、`edit/CommissionEditForm.tsx:428`、`DuplicateCommissionNotice.tsx:10-75`。匹配为零时卸载，非零最多渲染四条，加标题、说明与理由。

影响：保存按钮随作者输入/退格来回移动，390px 一条提醒已增加约 198px。保留常驻检查摘要槽，使用“Possible duplicates: N · Review”之类短文案；详情由用户主动打开现有 Radix Popover。移动端详情限制在视口内并可滚动，必要时复用 Dialog。不能靠 debounce 解决几何变化，也不能隐藏非阻断警告。

### S08 · P2 · 表单/列表反馈增删及长错误挤压主操作

证据：`FormStatusIndicator.tsx:26-49` 2.5 秒后返回 null；`create/AddCharacterForm.tsx:124-143`、`AddCommissionForm.tsx:208-225` 的 flex 行；`edit/CommissionManager.tsx:363-391`、`hooks/useCommissionManager.ts:336-345` 的临时反馈。

影响：角色表单变高会推动整张作品表单，列表反馈会推动搜索栏；长错误已将 150px 保存按钮挤到 120.69px。主按钮 `shrink-0`、Hidden 固定布局，状态独立成常驻短摘要槽；错误详情通过可访问入口查看，保留至解决或再次操作。成功可淡去，但其占位不消失。普通 Saving 文案已有固定宽度，不应误报为主要根因。

### S09 · P2 · 抽屉图片状态插入字段上方且错误自动消失

证据：`edit/CommissionEditForm.tsx:192-202,374-390`。上传成功和错误使用相同 2.4 秒清除定时器。

影响：已测字段先下移再上移 36px；用户可能还没读完错误。固定图片状态槽，错误持续可见并可重试；成功仅替换摘要内容。保留现有图片比例、裁剪状态和退出动画契约。

### S10 · P2 · 移动端分篇字段条件插入

证据：`create/CommissionFormFields.tsx:556,595-618`；`AddCommissionForm.tsx:134-139` 可从文件名自动填充分篇。

影响：主动选分篇后 Links 已测下移 110px；裁剪确认自动填充时变化可能更意外。建议 Part number 始终渲染，Standalone 时禁用、不 required、不参与有效 payload，分组时启用。另一可行方案是用户主动进入完整分篇配置区，但不推荐继续由文件名识别静默扩大表单。明确区别“用户意图中的展开”和“后台副作用中的跳动”。

### S11 · P2 · 窄屏最小宽度与长内容缺少边界

证据：`AddCharacterForm.tsx:45`、`AddCommissionForm.tsx:155` 的 `min-w-[20rem]` 配 `AdminLayout.tsx:27` 的 `mx-4`。320px 已证实 336px 文档宽度。

修正：表单与 grid/flex 子项使用可收缩宽度，长文件名/分组名称定义单行摘要和完整可访问名称。`ui/select.tsx:23-40` 的长值需要额外浏览器测试，暂不将它认定为已复现溢出。验收包含长中文作者、无空格文件名及 200% 文字缩放；不得以裁掉必要信息实现“无溢出”。

### S12 · P2 · 角色加载失败后无局部错误状态

证据：`edit/CommissionManager.tsx:215-237` 只写全局 `loadError`；`SortableCharacterCard.tsx:315` 在 `!isCommissionsLoaded` 时仍显示 skeleton。

影响：顶部新增错误推移列表，失败角色继续装作加载中且没有就地重试。建立每组 `idle/loading/ready/error` 状态，在原结果区域展示错误和 Retry。保留原高度或原有内容，避免又以小错误行替换大网格。代码可确认，正式失败 fixture 回归列入实施。

### S13 · P2 · 缓存与反馈语义不一致

证据：`pages/AdminCreatePage.tsx:93-117` 已有 payload 时直接返回 Dashboard，后台刷新失败不可见；`edit/CommissionManager.tsx:205-207` 对已加载组短路，bootstrap 更新没有对应组缓存失效；`:301-305` 本地保存更新 loaded rows，但搜索依据另一份 props。

影响：如果只删 Edit 的 Refreshing，可能把“过期内容”和“更新失败”一起藏起来。此项为相关状态一致性风险，不计作已测布局位移。共享 bootstrap 状态应区分有无数据、是否刷新、是否过期；成功 mutation 明确更新/失效相关缓存，保持当前草稿和选中项。Create 当前热加载已经静默且不会因 payload 更新必然 remount，必须保留这一点。

### S14 · P3 · 重复位移动画与 reduced-motion 缺口

证据：`AdminLayout.tsx:72-76`、`AdminCreateDashboard.tsx:26-31` 的多层 tabFade；`CommissionManager.tsx:489` 未加 motion guard；`SortableCharacterCard.tsx:295-311` 的 reduceMotion 来自搜索状态，不是系统偏好；`ui/dialog.tsx:78-86` sheet 使用缩放动画。

影响：即使不发生文档流重排，内容也在移动；transform 不应被称为 CLS。页面主体最多保留一次淡入，常规刷新不重新入场；所有位移/缩放尊重系统偏好。Delete/Cancel 条件展开（`CommissionEditForm.tsx:451-493`）还可能改变动作区宽度，应在抽屉操作栏验收中覆盖，不增加一套删除交互机制来解决纯样式问题。

## 推荐的页面与状态设计

### 保留的边界

- 保留中性浅/深主题、现有字体、Radix Select/Popover/Dialog 和已有日期控件。
- 保留 `1280×525` 图片契约、自由旋转和裁剪后上传；裁剪退出回调等待 Radix 退场，避免重新引入已修复的内容塌缩。
- 保留公开 UUID、显式日期/作者、分篇组与正整数编号，UI 整改不改数据库、不改 API。
- 缓存内容在刷新失败时仍可浏览；不以重新挂载表单来刷新选择项，不覆盖用户已经输入的草稿。

### 共用状态规则

按数据与操作两个层次组织，不需要引入新状态管理依赖。

1. `initial-loading`：页面结构先存在，依赖数据的区域为等结构占位/禁用控件，角色占位文案保持中性。
2. `ready`：显示当前数据，不渲染空状态行。
3. `refreshing`：旧内容原位，正常刷新静默。
4. `stale-error`：旧内容原位，浮窗显示错误与 Retry，详情可展开，错误不会自动消失。
5. `initial-error`：原加载区域呈现错误与 Retry，不声称无数据就是空库。
6. `saving/success/error`：按钮大小固定；结果浮窗不占表单空间。长错误完整内容可用键盘访问，不截断到无法理解。

刷新和保存的状态应分开：保存成功但后续刷新失败时，不能让用户误以为保存失败并重复提交。mutation 继续遵循单次请求约束。

### Create：以新增作品为主流程

将低频 Add Character 收为明确的次级入口，放在作品表单标题旁，点击后用现有 Dialog 完成；保存成功刷新角色选项并回到保留的作品草稿。API 未返回创建 ID，不根据名称推测新角色身份。这样可去掉目前位于主要作品流程上方的大块表单，不强迫用户每次滚过它。

目标结构示意（不是已实现界面）：

```text
Create                                      [sync status]
--------------------------------------------------------
Source image             [Choose / Replace]
File summary             [image status - stable slot]

Character [+ New]        Delivery date       Creator
[ ] Part of a multi-part work
    Part grouping        Part number (only when checked)
Links
Design                   Description
Keywords

--------------------------------------------------------
[Hidden]  保存后应用的可见性设置
------------------------------------------------
[Save commission]
                            [floating notice, if needed]
```

不新增常驻大图预览占位以制造空白；图片摘要足够，详细调整仍进入现有裁剪器。手机布局按既有断点变一列，字段存在性不随自动提示改变。提交区第一阶段保留文档流位置，前面的内容稳定后自然稳定；不要直接加遮挡键盘的全局 fixed 保存条。

### Edit：工具栏、结果区域、编辑器各管自己的状态

```text
Edit                                        [sync status]
--------------------------------------------------------
[Search commissions................] [Keyword] [Sort]
[result count / search state - stable slot]

Browse: character header
        count-matched cards / loading / local retry

Search: stable result cards from bootstrap matches
        details loaded on selection
```

搜索模式和浏览模式复用卡片表现，不通过自动展开八个角色实现搜索。切换回浏览保留原展开组、滚动锚点；搜索在同一结果容器更新，不扩散到页头。

编辑抽屉保留固定 header、可滚动 body；保存区在表单底部通过分隔线与留白独立分区。图片/保存反馈放当前模态的浮窗，正常表单无空状态槽。保留现有两步删除，不扩张危险操作流程。

手机 footer 需适配 safe-area、动态视口与软键盘，不能遮住最后一个字段；抽屉仍使用现有全屏布局。保留关闭期间上一条 commission 的缓存，避免退场时正文突然为空。

## 分阶段实施与文件范围

### 阶段 A：稳定状态与字段，先解决日常可见问题

- `apps/admin/src/pages/AdminCreatePage.tsx`、`AdminEditPage.tsx`：统一初始加载/后台刷新/失败语义，移除普通流中增删的页级状态块。
- `apps/admin/src/App.tsx`、`components/AdminLayout.tsx`：路由加载与页面结构契合，现有 shell 承载稳定状态入口，减少多层平移动画。
- `components/AdminCreateDashboard.tsx`、`edit/CommissionManager.tsx`、`edit/SortableCharacterCard.tsx`、`ui/dialog.tsx`：阶段 A 只处理重复入场与 reduced-motion；列表状态重构留至阶段 B。
- `components/create/CommissionFormFields.tsx`：固定说明样式、checkbox 控制 Part 字段、长值边界、统一标签缩进。
- `components/create/AddCharacterForm.tsx`、`AddCommissionForm.tsx`：修正最小宽度，按钮与反馈分开。
- `components/FloatingNotice.tsx`、`FormStatusIndicator.tsx`、`create/DuplicateCommissionNotice.tsx`：脱离文档流的通知，详情按需呈现，错误不自动消失。
- `components/edit/CommissionEditForm.tsx`、`CommissionEditDrawer.tsx`：稳定图片反馈与操作栏，保留裁剪退出行为。

验收：S01、S06–S11、S14 对应状态下非目标字段与动作位置稳定，缓存失败仍有入口，键盘能访问完整错误。阶段 A 不改变 Add Character 入口位置，便于隔离功能与布局回归。

### 阶段 B：收敛列表加载与滚动模型

- `components/edit/CommissionManager.tsx`：每组请求状态、匹配计数、搜索结果模式、缓存失效规则；废除临时顶层错误行。
- `components/edit/CommissionThumbnailGrid.tsx`、`SortableCharacterCard.tsx`：占位与真实卡共用尺寸；局部错误/重试。
- `hooks/useCommissionManager.ts`、`App.tsx`、`pages/AdminEditPage.tsx`：统一滚动所有权、锚点恢复与用户操作取消逻辑。
- 如重复页面请求逻辑妨碍语义一致，抽取一个小型共享 bootstrap hook；不扩成泛用数据框架，也不升级依赖。

验收：S02–S05、S12–S13，包含 0/1/6/7/30 条作品、跨组搜索、失败重试、返回列表。移除 `window.location.reload()` 的批量关键词更新路径属于本阶段状态衔接范围（`CommissionManager.tsx:320-325`），须以定向数据刷新取代，保留焦点/查询。

### 阶段 C：简化 Create 信息层级并收口回归

- `components/AdminCreateDashboard.tsx`、`create/AddCharacterForm.tsx`、`AddCommissionForm.tsx`：作品为主入口，新增角色作为次级操作；验证保存后更新角色选项、取消返回草稿。
- `apps/admin/test/visual/*`：新增状态转换与几何检查，静态截图继续保留；禁止仅更新基线掩盖偏移。
- `apps/admin/AGENTS.md`：落地浮动通知、请求状态、滚动和弹层约束；根 AGENTS 更新实际新增模块。只有实际 API 行为改变时才同步 API 文档，本计划不要求 API 修改。

实施量级估算：A 约 1–2 人日，B 约 2–3 人日，C 与跨设备回归约 1–2 人日；合计 4–7 人日，属于规划估算，取决于是否一并改搜索展示与角色入口。先交付 A 是可行的最小方案，完整推荐方案继续完成 B/C。

## 验收矩阵与测试方法

现有 `admin-create.spec.ts:25-60`、`admin-edit.spec.ts:60-85` 主要验证终态截图；`test/visual/helpers.ts:35-54` 会等待字体并禁动画，无法证明中间状态稳定。保留这些测试，但新增独立时序测试，不替换截图基线。

- **页面进入**：冷开、缓存命中、Create/Edit 来回、浏览器后退；响应 50/500/2000ms；初始失败、缓存刷新失败、Retry、页面离开中取消。
- **表单**：有效裁剪确认/取消、无效文件、长文件名、自动识别信息；duplicate 0→1→4→0；分篇切换；成功显示/消失、长服务端错误；角色保存反馈不能推动下方作品表单。
- **列表**：0/1/6/7/30 条；多组不同延迟；搜索快速输入/清空；局部失败及 Retry；计数更新、已加载组更新、保存后搜索可见性。
- **抽屉**：图片加载成功/404、上传失败不自动消失、裁剪返回、保存、删除确认/取消、关闭后焦点恢复；长错误不能压缩保存按钮。
- **滚动**：展开多个长组并滚到中部，离开再回来；刷新、搜索返回；数据晚到期间主动滚动，应立即放弃自动恢复；记录 anchor ID、offset 和最终视口偏差。
- **适配**：320/390/768/1280px，浅/深色，正常/reduced motion，中文长文本、200% 文字缩放；Chromium 与 WebKit，手机键盘手动补测。

几何断言：在固定视口/字体条件下，刷新、状态文本切换、占位替换不应让非目标锚点的文档坐标变化超过 1 CSS px；控件尺寸也需记录。用户主动改变搜索结果、展开分组、手工 resize textarea 等有意结构变化不适用“绝对不动”，但完成网络加载后不应再发生无关二次跳动。未加载未知角色数量时，优先保证页头/搜索框稳定，不虚构全页零位移指标。

滚动断言：恢复到目标作品偏差不超过 4px；焦点不丢失、不被后台请求抢走。保存按钮宽度保持设计值，窄屏没有横向文档溢出。成功/失败反馈使用适当 live region，加载容器有 `aria-busy`；不能用 `aria-live` 持续播报搜索的每一帧变化。

补充记录 `PerformanceObserver('layout-shift')`，同时保存 `hadRecentInput`、受影响节点与几何数据。不能仅用 CLS≈0 作为通过依据：输入后的位移和 transform 动画可能不计入 CLS。本轮只完成几何测量，未提供 CLS 数值。

实施后执行目标单测、Admin typecheck/build、受控 fixture 浏览器时序测试，再按仓库门禁运行 lint/typecheck/test；涉及实际 UI 的修改运行 Admin visual suite。使用 `mise exec -- pnpm ...`，依赖重链接期间串行执行。测试数据独立于远程生产库，不从现网截图的不稳定数据重写基线。

## 当前交付与后续入口

### 扩展范围：Overview、Suggestion、Aliases 与 Keyword

- **Overview（后台首页）**：先放 Create/Edit 主入口及 Alias/Suggestion 次级入口，再放紧凑统计、独立发布区和最近十条作品。连接状态、API origin、别名细分统计与刷新收进 Connection details，仍完整可用。公开站首页不在本轮视觉改版范围。
- **Suggestion**：显示顺序与可选词池成为两块并列工作区，窄屏纵排；手动添加独立，保存有清晰边界。保留最多六项、去重、拖动排序，并补键盘/触屏上下移动。后台刷新不覆盖未保存草稿，Enter 添加关键词不能意外提交整表。
- **Aliases**：三类映射共享行结构、筛选、保存流程，切换 tab 不卸载草稿；只提交修改行，空字符串仍是显式删除。作者的多个别名全部显示，不能只回显第一个后误覆盖剩余值。
- **Keyword**：批量替换从狭窄 Popover 改成有明确查询区、滚动预览和固定操作区的 Dialog。保留整条作品 metadata 与分篇关系；部分成功刷新已完成数据，重试跳过已成功项，避免重复替换。
- **发布和反馈**：浮动 Rebuild 使用同一通知栈，不覆盖成功/错误提示；Overview 只保留页内发布操作。跨路由共享请求状态，保存版本与发布快照对应，不能用一个旧请求清掉新修改的待发布标记。

以上调整复用现有 API 和数据模型，未改变 D1/R2 schema、公开站导出契约、裁剪能力或 CRUD 范围。表单 action 在 try 内等待异步请求，网络拒绝仍返回可展示的表单错误。

### 最终验证（2026-09-30）

- 全量 Vitest：70 文件、324 项通过；全仓 ESLint、四个 workspace TypeScript、Admin production build 通过。
- 独立 Chromium 回归：27 项通过。覆盖 Create/Edit 冷加载与静默刷新、短 ID 单处展示、字段对齐、分篇草稿、保存错误浮窗、动画、长列表刷新恢复、17° 裁剪与 JPEG 尺寸，以及四个扩展页面的关键交互。
- 新增跨路由发布按钮去重、待发布 revision、Suggestion 保存快照、Aliases 显式清空与多别名、Keyword 部分成功重试的逻辑用例。
- 浏览器仅连接本地 Vite，Admin API 全部 fixture 拦截；未修改远端生产业务数据。已查看浅/深色及手机/桌面截图；真实 WebKit、移动端软键盘与生产登录态 UI 仍属于人工设备验证边界。

审计阶段已复现九个场景；后续整改进度与最终验证记录见 `tasks/todo.md` 的 Admin UI 修复切片。`playwright.admin-ui.config.ts` 与 `apps/admin/test/visual/ui-stability.spec.ts` 提供可持续复跑的 fixture 时序/几何/动效验收。它只启动 Vite、拦截全部 Admin API，不调用生产 D1/R2；截图与终端通过不能替代真实 Safari/手机键盘验收。
