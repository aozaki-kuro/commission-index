# 设计一致性审计（2026-11-01）

两个只读子代理分别审计 `apps/web`、`apps/admin` 的样式代码；主会话在本地 fixture 站点（桌面 1440×900、移动
390×844，明暗两种）和生产站点上抽查，标「已核」的条目有浏览器实测或源码复核。行号对应 `5917661`，会漂移；
动手前重新核对。

严重度：H 用户可见的错误或功能失效；M 明显的不一致；L 卫生。O = 客观问题，可直接修；T = 品味取舍，需 owner 拍板。

## 0. 结论：拼凑感来自三个共同根因

1. **web 的 base 层被原样复制进了 admin。** `h1/h2/p,li/a` 规则（web `globals.css:72-97`，admin
   `globals.css:200-220`）直接给 `<p>` 上色，压过父元素的语义色。web 页脚说明（DS-W2）和 admin 的错误/警告通知
   （DS-A1）都是这个原因。根治办法是删除 `p, li` 的颜色规则，改由 body 设置默认文字色；但 owner 拍板「字色不要大改」，
   所以保留这条规则，只在页脚和通知这两处就地修复（见拍板结果中的「字色」一行）。
2. **Apple 的系统灰被嫁接到了两套不同的底色上。**
   - web：页面是 `#171717`（neutral，无色相），菜单却是 Apple 的 `rgb(29 29 31)` 加 `backdrop-saturate-180`，
     元素又用 Tailwind 4 的 `gray-*`（偏蓝，hue≈260）。
   - admin：画布是 Vercel 的 `#000/#0a0a0a`，裁剪器却用 iOS 的 `#1c1c1e`、`#d1d1d6/#2c2c2e` 加 `saturate(150%)`。
   - 结果：同一深色页面上并存四五种表面色，暗色模式下尤其明显。
3. **没有共享的控件、按钮和动效 token。** 每个 PR 各写一套：
   - web：5 种 hover 方式、4 条缓动曲线、11 种阴影配方。
   - admin：约 9 种手写的次级按钮、2 套控件外观、2 套焦点体系。

Apple 化改动（#427–#440）里**可以保留**的：

- 移动端全屏面板（长角色列表确实需要）；
- 统一的菜单材质（但要重新调色到本站色板）；
- browse 面板以字重区分层级、不用 chip。

**不适合本站**的：

- 大写字距标签；
- hover 时滑入的 chevron；
- 压在正文上的高饱和毛玻璃；
- 48px 侧边距。

审计时原本也把汉堡菜单的 28px 半粗行、Apple 缓动曲线和逐行错峰动画列为不合适，owner 拍板保留（见 D2）。

## 1. 需要 owner 拍板（T）

每项列出两个选项，**粗体**是推荐。品味类改动按惯例先做明暗、桌面和移动端的 A/B 实时预览，再提 PR。

| ID  | 问题                                                                                                         | 选项 A                                                                                                                                                                 | 选项 B                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1  | web 暗色色系：页面是 neutral，元素是偏蓝的 gray，菜单是 Apple 灰                                             | **在 web `@theme` 里把 `gray-*` 改成 Tailwind neutral 的值（一处改动，全站统一；admin 已经用同样的思路覆盖了 gray）；菜单换成 `neutral-900/80`，删掉 `rgb(29 29 31)`** | 页面改为 `gray-900`，整站保留冷灰色相                                                                 |
| D2  | 移动端汉堡菜单：行高 21.6–28px、字重 600，比页面 h1（25.6px）还大；配 Apple 曲线和逐行错峰                   | 回到桌面侧栏的层级（`text-base` 粗体，约 44px 行高）                                                                                                                   | **保留大号行，但不超过 h2（≤22px），改用粗体；去掉 Apple 曲线、错峰动画和 hover chevron**             |
| D3  | 分组标签（Active / Archived）有三种画法：侧栏用粗体加图标，汉堡菜单是 17px gray-500，browse 面板是大写加字距 | 三处都用侧栏样式                                                                                                                                                       | **两个菜单统一为安静的 sentence-case 标签（`text-sm gray-500`，不用大写）；侧栏本身是导航，保持不变** |
| D4  | base 链接规则只在暗色下设 `dark:text-white`，组件里到处要用 `!` 覆盖                                         | **base 改为 `dark:text-inherit`，删除各处覆盖**                                                                                                                        | 只给正文段落里的链接（`main p a`）设白色                                                              |
| D5  | admin 有 46 处 `font-medium`，但只加载了 Plex 400/600，500 一律回退到 400                                    | **加载 `latin-500.css`，保留原本的设计意图**                                                                                                                           | 删掉 `font-medium`，只用 400/600                                                                      |
| D6  | admin 裁剪器：毛玻璃 + iOS 灰，违反 `.impeccable.md` 的「编辑和作品表面不透明」                              | **改用不透明的 `gray-*` 和 `admin-surface`**                                                                                                                           | 保留毛玻璃，但统一走 `.admin-glass`                                                                   |
| D7  | web 桌面侧栏混用五种图标隐喻：放大镜、chevron、实心双三角、✧、圆点                                           | **只保留展开/收起用的 chevron；当前项用字重或圆点表示，去掉 ✧ 和实心三角**                                                                                             | 维持现状                                                                                              |

### 拍板结果（owner，2026-11-01，看过 A/B 预览后）

| ID     | 结论                                                                                                                           | 对执行的影响                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1     | **A**：web `gray-*` 改为 neutral，菜单用页面同色                                                                               | DS-W3 按 A 执行                                                                                                                                                         |
| D2     | **维持现状**。owner 的理由：移动端的使用习惯里，字大一点无妨；动画好看，不删                                                   | 汉堡菜单的字号、Apple 曲线和错峰动画都保留。DS-W8 只收敛其他地方的缓动，不动汉堡菜单                                                                                    |
| D3     | **B**：两个菜单统一为安静的小号灰字，不用大写；侧栏不变                                                                        | —                                                                                                                                                                       |
| D4     | **A**：base 改为 `dark:text-inherit`，删除各处覆盖                                                                             | —                                                                                                                                                                       |
| D5     | **A**：加载 Plex 500                                                                                                           | —                                                                                                                                                                       |
| D6     | **O1**：裁剪对话框本体和工具栏改为不透明（去掉 `/0.96`、`/92` 和 `backdrop-blur`），颜色不变；背景遮罩保留磨砂（`blur(20px)`） | 对话框本体从此符合「编辑表面不透明」。遮罩上的玻璃是允许的浮层；视觉测试 `crop dialog uses the site glass…` 断言的遮罩模糊和 workspace 底色都不变，断言不用改，只刷基线 |
| D7     | **维持现状**：侧栏图标不变                                                                                                     | —                                                                                                                                                                       |
| DS-W12 | **I48**：浏览面板改成 `px-12`，跟随汉堡菜单（汉堡菜单不动）                                                                    | 两个全屏面板共用 48px 内边距；正文仍是 16px                                                                                                                             |

| 字色 | **不要大改**：保留两端 base 层的 `p, li` 颜色规则 | DS-W2 只在页脚说明的 `<p>` 上设 `text-gray-500 dark:text-gray-400`；DS-A1 只让通知里的 `<p>` 继承语义色（`text-inherit`）。admin 的 `h1/h2/a` base 规则只在确认零视觉变化时才删（Phase 4） |

次要项按默认处理，除非你反对：

- 品牌粉只在 admin 的 `selection:bg-rose-200/40` 出现。默认定义一个 `--brand-pink` token 并收敛到它；web 维持灰色选区。
- 年龄门的蓝色/粉色浅底按钮：按语义（确认 / 离开）保留，只把面板色并入 D1。

## 2. web 客观问题（O）

### 缺陷

- **DS-W1（H，已核，生产复现）**：桌面右下角的「回到顶部」按钮在视口外，用户从来看不到。
  - 机制：`DesktopSidebarNav.astro:176` 的 `<aside>` 带内联动画 `animation: reveal-up … both`，动画结束后保留
    `transform: matrix(1,0,0,1,0,0)`。即使是单位矩阵，它也让 aside 成为 `fixed` 子元素的包含块。于是
    `fixed left-[calc(50%+22rem)]` 按 218px 宽的 aside 计算：本地 x=1533，生产 1440 视口下 x=1581，y=1036。
  - 这是 history reset（`63437af`）之前就有的问题，**不是** Apple 化引入的。
  - 改成 `.animate-reveal-up` 工具类也修不好，它同样用 `both`。
  - 修法：二选一。(1) 两个 aside 改用 `backwards` fill，动画结束后不再保留 transform；(2) 把按钮的 fixed
    容器移出 aside。推荐 (1)，一行改动；之后要验证按钮在可视区内。
- **DS-W2（H，已核）**：页脚说明不会变灰。
  - `Footer.astro:21-23` 把 `text-gray-500` 设在 `<div>` 上，但全局 `p, li` 规则直接给 `<p>` 上了正文色。
    实测三条说明都和 © 行同色。帮助弹层的说明文字也受同一原因影响。
  - 修法见 §0-1。

### 色彩与材质

- **DS-W3（M）**：深色浮层有五种：
  - 页面 `#171717`；
  - 菜单 `rgb(29 29 31/.8)`（`globals.css:248`、`MobileHamburgerMenu.astro:96`、`CommissionSearchIsland.astro:585`）；
  - 按钮和 toast `black/80`；
  - 年龄门 `gray-950`（偏蓝，比页面还暗，`AgeGateScript.astro:44`）。

  暗色边框混用 `neutral-800`、`gray-800`、`gray-700`、`gray-600`。暗色下的图片占位块是 `gray-800`（实测
  `oklch(.278 .033 257)`，明显发蓝），压在 `#171717` 上（`CommissionEntries.astro:120-122`）。处理依 D1 的选择。

- **DS-W4（M）**：同一种 40px 圆形浮动按钮有两套配方。
  - `STYLES.floatingButton`（`constants.ts:5`）：`ring-black/5`，阴影 2px/8px。
  - 回到顶部（`DesktopSidebarNav.astro:346-357`）：`border-white/20`，阴影 8px/30px，`text-gray-500`。
  - 它的 `translate-y-1` 设的是 Tailwind 4 的 `translate` 属性，而 transition 只监听 `transform`，上浮效果会直接跳变。
  - 图标尺寸也不一致：语言按钮 `size-6`，汉堡和关闭按钮 `size-5`。
  - 修法：全部改用 `floatingButton`。
- **DS-W5（M）**：同一行里的关键词 chip 和「All」按钮外观不同。
  - 边框：`gray-300/80` vs `gray-200/80`；背景：`/75` vs `/70`。
  - chip 没有阴影，「All」有两层阴影（`commissionSearchController.ts:95-103` vs `Island.astro:353-362`）。
  - 修法：两者都用 chip 的配方。
- **DS-W6（L）**：图片占位块有两套。加载中是 `gray-200/80`（暗色 `gray-700/60`），缺图是 `gray-100`（暗色
  `gray-800`）。archived 占位块是全站唯一使用 `stone` 色系的地方（`StaticCommissionSections.astro:75-118`），色调偏暖。

### 交互状态与动效

- **DS-W7（M）**：同类控件有 5 种 hover 方式：opacity、背景色块、边框加文字、边框加背景加阴影、文字变色。
  - 汉堡菜单的分组开关用 `hover:text-gray-900`（`MobileHamburgerMenu.astro:33`），违反了 AGENTS.md 对同一面板
    记录的「只用 opacity」规则。
  - 收敛为两种：文字链接和标签用 opacity；`menu-glass` 里的行统一用一种底色（`gray-900/6`，暗色 `white/10`）。
- **DS-W8（M）**：缓动曲线有 4 条：原有的 `(0.22,1,0.36,1)`、Apple 的 `(0.4,0,0.6,1)`、expo、`(0.4,0,0.2,1)`。
  - 同一个 disclosure，汉堡菜单里是 320ms 配 Apple 曲线，侧栏里是 240ms 配另一条。
  - 汉堡菜单打开 400ms、关闭 220ms。
  - 收敛为两个 token：进入用 `(0.22,1,0.36,1)` 配 180/240ms；退出用 `ease-in` 配 120ms。
- **DS-W9（L–M）**：焦点样式不统一。
  - outline `gray-500/300` 出现 11 次；另有 outline `gray-400`、ring `gray-400`、ring `gray-400/70`。
  - 侧栏搜索链接没有焦点样式（`DesktopSidebarNav.astro:62-66`）。
  - `#` 锚点用了 `outline-none`（`Listing.astro:58` 等）。

### 字体排印

- **DS-W10（L）**：Apple 为 SF Pro 调的数值放在 Plex 上没有意义：`tracking-[0.007em]`、`tracking-tight`、
  `text-[17px]/[21px]`。
  - `font-semibold` 用了 12 处，但 600 字重没有预加载（`BaseLayout.astro:36-41` 只预加载 400/700），首屏会晚一拍
    换字体。
  - `text-[11px]` 有 20 处，建议改成 `--text-2xs` token。
- **DS-W11（L）**：AND/OR 徽章是 `font-mono`，紧挨着无衬线的搜索词（`commissionSearchDropdownRenderer.ts:42-47`），
  违反 PRODUCT.md 的「同一行不混用两种字体」。改成无衬线。

### 布局

- **DS-W12（H，移动端，已核）**：同一页面的左边缘有三个值：页面 16px（`mx-4`）、browse 面板 24px（`px-6`）、汉堡
  菜单 48px（`px-12`）。两处注释都写着「与对方一致」，实际并不一致；模糊半径也不同（20px vs 24px）。
  修法（owner 选 I48）：浏览面板改成 `px-12`，和汉堡菜单一致；模糊半径一并统一。
- **DS-W13（M）**：`menu-glass` 里的行几何不统一。
  - 建议行 `rounded-sm px-3 py-1.5`，贴着列表边。
  - 语言菜单行 `rounded-lg px-4 py-1`，约 28px 高，触控目标偏小。
- **DS-W14（L）**：两侧栏到内容的间距不对称。
  - 左侧控件区距内容 1rem，右侧角色列表距内容 4rem（`pl-12`）。
  - z-index 层级：20/30/50/60/65/70/80/90/95，写法上 `z-[70]` 和 `z-90` 混用。
  - 年龄门（z-80）排在浮动按钮（z-90）下面，要靠 JS 去隐藏按钮。

### 死代码与重复（L）

- `globals.css` 里有未引用的 keyframes 和工具类：`fadeInOut`、`tabFade`、`popover-content-*`、`search-dropdown-in`、`fade-in`。
- `hr` 规则没有对应元素。
- Tailwind 3 的边框兼容块可以删除；所有 `border` 都已显式带颜色，按 grep 核对过。
- `reveal-up` 内联写了 4 次，没有用工具类。
- 帮助内容在 Astro 标记和 `renderHelpContent` 里各有一份（未核）。
- 侧栏的 `sidebarNavLinkClass` 与 `localeLinkClass` 内容完全相同。
- 禁用链接同时设了 `pointer-events-none` 和 `cursor-not-allowed`，后者永远不会生效；文字色哪个生效取决于样式表顺序（未核）。
- 毛玻璃模糊同时写在 class 和内联 style 里，共 3 处。

## 3. admin 客观问题（O）

全部从代码得出；视觉上只核对了 3 张亮色基线截图。暗色表面的结论可以直接从 token 确定：`gray-900` 被覆盖为
`#171717`，而画布是 `#000`。

### 缺陷

- **DS-A1（H）**：错误和警告通知一半是语义色，一半是灰色，因为 base 层的 `p` 规则压过了 `FloatingNotice` 的
  继承色。共 6 个文件：`CommissionManager.tsx:481,487,488`、`AdminBootstrapStatus.tsx:31`、
  `FloatingRebuildButton.tsx:38`、`DuplicateCommissionNotice.tsx:54`、`FormStatusIndicator.tsx:59`。修法见 §0-1。
  - base 的 `h1/h2` 规则在每个页面都被覆盖，等于无效。
  - `h2 { font: bold; }`（`globals.css:206`）是无效的简写。
  - base 的 `a` 规则逼得组件用 `no-underline` / `hover:opacity-100` 去反着覆盖。
- **DS-A2（H，已核）**：`font-medium` 渲染成 400，见 D5（`main.tsx:4-5`）。

### 控件与按钮

- **DS-A3（H，基线可见）**：同一个表单行里并存两套控件外观。
  - `SelectTrigger`（`ui/select.tsx:23-34`）：`rounded-lg`、`border-gray-200`、半透明 `bg-white/80`。
  - `formControlStyles`（`app/ui.ts:12`）：`rounded-md`、`border-gray-300`、不透明背景。
  - 两者的暗色 placeholder 明暗正好相反。
  - 日期组合控件把 `rounded-md gray-300` 的输入框和 `rounded-r-lg gray-200 bg-white/80` 的按钮粘在一起
    （`CommissionFormFields.tsx:301,355`），一个控件里出现两种圆角、两种边框。
  - 修法：Select 和日期按钮都改用 `formControlStyles`。
- **DS-A4（H）**：没有共享的按钮样式。
  - 约 9 种手写的次级按钮：高度 36/40/44，圆角 md/lg，4 种 hover 色。
  - 主按钮 5 种写法。
  - 禁用态有 5 种 opacity。
  - 危险按钮 hover 一处变深（`red-700`）、一处变浅（`red-500`）。
  - `SaveButton` 和 `SubmitButton` 实质重复。
  - 修法：在 `app/ui.ts` 加 `buttonStyles.{primary,secondary,danger,ghost,icon}`，统一高度、`rounded-md` 和禁用态。
- **DS-A5（M）**：控件尺寸有三种。
  - `formControlStyles` 约 42px，`metadataControlStyles` 是 `min-h-11 px-4`，内联重命名框是 `h-11 px-2`，各自配色。
  - 标签和说明文字用 `pl-1` 缩进，既不对齐控件边框，也不对齐控件内文字。
  - 修法：统一一套控件规格，去掉 `pl-1`。

### 规则违反（`.impeccable.md`）

- **DS-A6（M）**：毛玻璃用在了允许范围之外：
  - Select 下拉（`ui/select.tsx:65-66`）；旁边的日期弹层是不透明的；
  - 通知里的按钮（`FloatingRebuildButton.tsx:52-53`）；
  - 作品图上的重新上传按钮（`CommissionEditForm.tsx:415-417`）。

  同一个重新上传按钮，以及通知里的那个按钮，静止时也带阴影。浮层阴影有 8 种配方，应收敛为 1 种。

- **DS-A7（M）**：标题和说明重复。
  - Edit 页：外壳的「Edit」加说明，下面又是「Existing commissions」加说明，再加一行灰字。
  - Suggestion 页：卡片里重复了外壳的说明。
  - 嵌套卡片：`DuplicateCommissionNotice.tsx:15`、`CommissionThumbnailGrid.tsx:182,208`。
- **DS-A8（L）**：
  - 日历星期表头用了 `uppercase`（`CommissionFormFields.tsx:473`）。
  - 固定宽度按钮：`w-20`、`w-36`、`w-28`。
  - `#id`、Live revision 和「Saving x/y」缺少 `tabular-nums`。

### 色彩与 token

- **DS-A9（M–H）**：token 只定义了两层暗色表面，代码里却有三层。
  - 角色卡片 `dark:bg-gray-900` 是 `#171717`（`SortableCharacterCard.tsx:106-107`），所以 Edit 页卡片明显比其他页更亮。
  - 对话框用 `bg-white/gray-950`，没有用 `var(--admin-surface)`。
  - 修法：一律改用 `admin-surface`。
- **DS-A10（M）**：焦点有两套体系：`outline-2 offset-2` 19 处，`ring-2 + ring-offset` 25 处。
  - 暗色的 ring offset 是 `gray-900`，放在 `#000` 上会出现一圈亮边。
  - 修法：统一用 outline，`globals.css:129` 的全局 `:where(:focus-visible)` 颜色已经可以直接用。
- **DS-A11（M）**：同一角色用了不同颜色。
  - 次要文字 `gray-500` 与 `gray-600` 混用。
  - 发丝线有 4 种亮色、5 种暗色；Archived 分隔线是暗色模式下最亮的一条线（`SortableDivider.tsx:15`）。
  - 修法：发丝线一个 token（`gray-200/800`），控件边框一个 token（`gray-300/700`）。
- **DS-A12（L）**：
  - 同类控件的圆角：`rounded-lg` 29 处，`rounded-md` 23 处。
  - 虚线占位框一处 `lg`、一处 `2xl`。
  - `text-[11px]` 7 处。
  - 图标线宽有 4 种：1.6/1.7/1.8/2。

### 动效与布局

- **DS-A13（M）**：入场动画叠了两层。外壳已经有 `tabFade 240ms`（`AdminLayout.tsx:44`），子页面又各加一层
  200–300ms，合计位移 12px。修法：只保留外壳那一层。
- **DS-A14（L–M）**：
  - 404 和错误页离开了 1600px 外壳（`App.tsx:62,210-226`）。
  - Publish 卡片的内边距和其他 surface 不一致。
  - 区块标题字号各页不同：`text-base`、`text-lg`、`sr-only`、`h3 text-sm`。
  - 遮罩有三种模糊。
  - 按下缩放和缩略图 hover 放大只用在部分元素上，两者都建议删除。
  - 关键词对话框有两层滚动。
- **DS-A15（L）**：死代码：
  - keyframes `slideInUp`、`drawerSlideIn/Out`；
  - 与 `dialog-overlay-in` 重复的 `overlayFadeIn`；
  - 未使用的 `[data-link-style]` 和 `--font-mono`。

## 4. 建议的执行顺序

1. **Phase 1，缺陷（O，不依赖拍板）**：
   - DS-W1 回到顶部；
   - §0-1 页脚（DS-W2）和 admin 通知（DS-A1）就地修文字色，`p, li` 规则保留（字色不要大改）；
   - DS-A3 控件外观统一；
   - DS-W12 浏览面板改成 48px，跟随汉堡菜单（I48）。
2. **Phase 2，token 收敛**：
   - web 色系（D1-A）、浮层材质和浮动按钮；admin 加载 500（D5-A）；
   - admin 的 `admin-surface`、发丝线、焦点 outline、`buttonStyles`；
   - 两端的动效 token。
3. **Phase 3，品味项**：D3、D4、D6-O1（已拍板）；D2、D7 维持现状，不改。
4. **Phase 4，卫生**：死代码、任意字号、`tabular-nums`。

### 执行注意（计划复核，2026-11-01）

- **（已被「字色不要大改」取代，保留作为日后根治时的参考）先设根墨色，再删 `p, li` 颜色。** 两端的根元素都没有设文字色：web 的 `body` 和外层 div、admin 的
  `.admin-workspace` 都没有。实测 web 页面里约 400 个 span、a、time 都是通过 `p, li` 继承到 gray-800 的。
  - 直接删掉这条规则，正文会变成纯黑或纯白。
  - 先在 web 外层 div 上加 `text-gray-800 dark:text-gray-300`，在 admin 的 `.admin-workspace` 上设对应的颜色，再删规则。
  - 删掉后，原本被压住的外层颜色都会生效（页脚、帮助弹层是有意为之，其他地方未知），所以要做一轮明暗双主题的全页对比。
- **DS-W1 要补回归断言。** 现有视觉 spec 只截局部区域，所以漏掉了这个问题。修复后加一条 Playwright 断言：滚动之后，
  回到顶部按钮的矩形必须完整落在视口内。
- **DS-W12 只在移动端生效。** 浏览面板只在 `<48rem` 时是全屏；桌面端是弹层，`px-6` 是对的。所以应该写成
  `max-md:px-12`，不要改全局的 `px-6`。
- **D1 是全局 token 变更，单独一个 PR。**
  - 所有 web fixture 基线都会变，要在桌面和移动端逐张核对后再刷新。
  - 要复核 `gray-400/500` 文字换成 neutral 后的对比度。
  - archived 占位块的 `stone` 色系（DS-W6）不受影响，需要另外决定是否并入。
  - web 与 admin 的灰阶各自独立。D1 用的是预览里确认过的 Tailwind neutral oklch 值，**不是**照搬 admin 的
    Vercel 十六进制（`#888`/`#666`）；对比度复核以 Tailwind neutral 为准。
- **D5 会让文字变宽。**
  - 和 DS-A8 的固定宽度按钮（`w-20`、`w-28`、`w-36`）一起改，否则按钮文字可能溢出。
  - 改完跑 `test:admin-ui` 和 admin 视觉测试，刷新基线。
- **D6-O1 要刷新 crop 基线。** 测试 `crop dialog uses the site glass…` 里对遮罩 `blur(20px)` 和 workspace
  `rgb(209, 209, 214)` 的断言仍然成立，不用改。
- **DS-W8 收敛缓动时排除汉堡菜单**（D2 维持现状）。
- **子代理报告里标了「未核」的两条，动手前要先核实**：帮助内容是否重复、禁用链接的颜色优先级。
- **PR 切分建议**：
  1. web 缺陷：W1、W2（就地修）、W12；
  2. admin 缺陷：A1（就地修）、A3、D6；
  3. web token：D1、D3、D4，W3–W9；
  4. admin token：D5，A4–A13；
  5. 两端卫生。

  每个 PR 都要过 lint、typecheck、test，以及对应的视觉测试。

### 复核时新增的小项（L）

- `MobileViewModeTabs.astro:47,73`：tab 下划线用 `transition-[width]` 做动画，会触发布局。改成
  `scale-x` 加 `origin-left`。
- `DesktopSidebarNav.astro:46,172`：两侧栏是 `fixed top-52` 加 `h-screen`，底部超出视口 208px。现在看不出影响，
  但改用 `bottom-0` 才符合本意。可以和 DS-W1 一起处理。
- `CommissionEditForm.tsx:417`：重新上传按钮压在作品图上，带 `backdrop-blur`，而这个容器会滚动（并入 DS-A6）。

## 5. 未覆盖

- web 没有截图核对的部分：帮助弹层、语言菜单、移动端年龄门、`/search/*`、zh-tw/ja 页面。
- CJK 回退字体没有审计。Plex 不含 CJK 字形，`font-family` 只回退到通用的 `sans-serif`，英文页上的汉字和假名
  由系统自行挑选字体，不同系统的结果会不一样。是否需要按 `:lang()` 指定回退字体，尚未评估。
- admin 没有跑实时页面（需要 remote D1）；Overview 和暗色模式只做了代码审查。
