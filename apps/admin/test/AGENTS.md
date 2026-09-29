# admin/test

Visual regression suites for standalone admin.

## Rules

- Target `apps/admin`, not `apps/web`
- Run `pnpm run test:visual` when changing: create page shell, edit page shell, manager search, drag ordering, source-image controls, suggestion page, or refresh button
- `pnpm run test:admin-ui` 使用根目录 `playwright.admin-ui.config.ts`，只启动前端，`visual/ui-stability.spec.ts` 拦截全部 Admin API。用于慢请求、通知几何、分篇、角色 Dialog、短 ID 位置、动画、长列表 reload 锚点和裁剪输出回归，不启动远端绑定 Worker。网格矩阵覆盖 320/768/1280px 与 0/1/6/7/30 条作品。
- 几何检查与动效检查分开：前者可使用 reduced motion 固定测量，后者必须恢复正常动效并验证实际 animation/transition；不能把禁用动画的截图当成动效已通过。
- 独立套件同时覆盖 Overview 发布入口、Suggestion 排序/手动添加、Aliases 三类草稿与显式清空、Keyword Dialog 查询/错误前后的固定操作位置；`aliases-ui.spec.ts` 补充 320/390/1280px、深色和长名称。所有请求均为 fixture，不向生产写入。
- 浏览器几何验证期间不要并发运行 build 或编辑源码，Vite 热更新会销毁测试页面上下文。源码检查与正式构建先完成，再串行跑浏览器套件。
