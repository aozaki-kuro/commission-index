# admin/test

Visual regression suites for standalone admin.

## Rules

- Target `apps/admin`, not `apps/web`
- Run `pnpm run test:visual` when changing: create page shell, edit page shell, manager search, drag ordering, source-image controls, suggestion page, or refresh button
- `pnpm run test:admin-ui` 使用根目录 `playwright.admin-ui.config.ts`，只启动前端，`visual/ui-stability.spec.ts` 拦截全部 Admin API。用于慢请求、通知几何、分篇、角色 Dialog、短 ID 位置、动画、长列表 reload 锚点和裁剪输出回归，不启动远端绑定 Worker。网格保留单卡、空列表、跨行和宽屏长列表代表场景，不展开尺寸与数量的笛卡尔积。
- 几何检查与动效检查分开：前者可使用 reduced motion 固定测量，后者必须恢复正常动效并验证实际 animation/transition；不能把禁用动画的截图当成动效已通过。
- 独立套件同时覆盖 Overview 发布入口、Suggestion 排序/手动添加、Aliases 三类草稿与显式清空、Keyword Dialog 查询/错误前后的固定操作位置；`aliases-ui.spec.ts` 补充 320/390/1280px、深色和长名称。所有请求均为 fixture，不向生产写入。
- 浏览器几何验证期间不要并发运行 build 或编辑源码，Vite 热更新会销毁测试页面上下文。源码检查与正式构建先完成，再串行跑浏览器套件。
- 布局持续回归以 320px 深色遍历五页；另验短窗口侧栏滚动、键盘跳转主内容、200% 字体和裁剪后预览 URL。Edit 搜索定位使用 `searchbox`，不是旧 `combobox`。全面截图矩阵留作审计证据，不常驻为重复用例。
- HiDPI 与连续导航合并，使用 1280×720 深色、2560×1440 浅色 CSS 视口及 DPR2 遍历五页；核对边界、无溢出和宽屏网格密度。全面对比度测量属于一次性审计，不保留通用颜色合成/指标采集器作为持续测试。
- 统一页面外壳须经真实 SPA 导航连续量测 main/header/h1/content/首表面左右边界，五页偏差不超过 1px；保留同一 Document 且无 beforeunload。监听在首次 goto 后挂载，避免把 about:blank 离开计为路由卸载。几何等待轮询当前运行的有限动画，不持有可能跨状态重建的 finished Promise；不禁用产品动效规避问题。
- 角色状态覆盖 Active→Archived→Active、正常/改名/取消、长名称与 320px/200% 文字；核对文字、无障碍描述及请求。冷加载角色头与真实卡片须等高，320/1280正常与320放大分别验收。诊断记录实际溢出元素，不能用隐藏横向溢出代替布局修复。
- 成功的排序 fixture 必须更新后续 bootstrap 的状态，并等待本 tab 刷新完成后核对归档/恢复；只返回 success 而维持旧快照会掩盖真实持久化语义。
