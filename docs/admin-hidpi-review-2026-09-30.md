# Admin 黑白配色与 HiDPI 密度验收（2026-09-30）

本文保留上一阶段的 66 项浏览器证据与按页面限宽方案；随后用户指出切页边界跳变，已改为五页统一外壳，并修正角色状态语义。最新规则与验收见 [一致性验收](./admin-consistency-review-2026-09-30.md)。

继续在 `redesign/admin-workspace` 调整上一轮设计。用户要求参考 Vercel、适量毛玻璃，并通过浏览器验证 2560×1440 HiDPI 下的可读性和信息密度；本轮保留完整功能，不部署。

## 设计与根因

参考 [Vercel Geist Colors](https://vercel.com/geist/colors) 的背景、组件表面、边框和主次文字分层。本实现使用自主维护的黑白中性灰，不引入 Geist 组件或字体依赖。浅色 canvas `#fafafa`、surface `#fff`；深色 canvas `#000`、surface `#0a0a0a`。品牌粉仅保留为小标记，操作状态沿用语义色。

旧工作区最大 1040px，扣除左右 padding 后只有 960px 内容，作品网格始终三列。在 2560px CSS 宽度下只利用侧栏之外约 41% 的横向空间；在 1280px CSS 宽度下却已接近 90%。因此问题不能用统一缩小字号或按 DPR 放大解决。

- Edit 限宽 1600px，Overview/Aliases 1440px，Create 1120px，Suggestion 1200px，均含工作区 padding。列表获得更宽的扫描区域，表单不铺满整屏。
- 桌面顶部从 48px 减为 32px，移除重复的 Collection workspace 眉题，标题 28px/36px；首个信息区从约 212px 提前到 143px。
- 作品按真实容器空间采用 2/3/4/5 列，断点为 40/62/78rem；标题从 12px 增至 14px，辅助信息保持 12px。1280px CSS 视口仍是三列，2560px 时五列；200% 字体通过 rem 断点降列。
- Overview 最近作品行从约 88px 收至 76px，主操作按实际容器分两列；Aliases 原名列限制为 10–18rem、行间距收至 12px，输入和保存目标不缩小。
- 毛玻璃只用于导航、吸附保存条和浮动通知，分别使用 86%/94% 不透明背景与 16px blur；正文和图片继续实底。支持减少透明度偏好和无 backdrop-filter 的实底降级。

## 浏览器证据

使用 Chromium、完全模拟的 Admin API、同一组 18 张作品。两种视口分别测试，不能把图片物理像素直接作为 CSS 布局宽度：

```text
CSS 逻辑视口     DPR   截图物理尺寸
1280 × 720       2     2560 × 1440
2560 × 1440      2     5120 × 2880
```

两种视口 × 浅深色 × 五页面，共 20 项 HiDPI 场景。等待数据、字体、有限动画和首屏图片后测量，保存原始 `hidpi-metrics.json` 与 device-scale 截图。断言横向无溢出、导航/操作不裁切、毛玻璃实际生效及正文样本对比度。

关键前后变化（CSS 像素，浅深色几何一致）：

```text
场景/指标                   调整前       调整后
全部页面信息区起点          211.9px      143.0px
2560 CSS Edit 工作区        1040px       1600px
2560 CSS Edit 网格          3 列         5 列
2560 CSS 首屏完整作品       15/18 张     18/18 张
1280 CSS Edit 网格          3 列         3 列
1280 CSS 首屏完整作品       3/18 张      3/18 张
最低正文样本对比度          4.68:1       5.08:1
```

对比度使用浏览器计算颜色，经 Canvas 转换为 sRGB，逐祖先合成透明背景，再计算相对亮度。覆盖标题、字段标签、helper、导航和作品 metadata；排除禁用、placeholder 和淡化装饰。最终最低浅色样本约 5.50:1，深色约 5.08:1，均高于本轮 4.5:1 门槛。该值是指定样本的验证，不代表整页 WCAG 认证，也不模拟任意图像穿透背景时的最坏组合。

主线程已查看大屏 Edit/Overview、720px 高 Create/Suggestion 的实际截图。新的工作区按用途利用宽度，图卡标题更易读；短视口保留表单滚动，不以强塞所有字段进首屏降低可读性。

## 骨架回归与最终检查

第一次完整回归发现标题字号增加后，骨架仍保留旧 16px 行高，造成每行 4px 的加载位移。已改为标题 20px/metadata 16px，与实际卡片一致；真实网格与骨架共用 `gridStyles`。原 13 项定向场景复跑通过，并补充 2560px 的 0/6/7/30 张作品几何验证。

- 最终完整浏览器回归：`mise exec -- pnpm run test:admin-ui`，**66 项通过（1.4m）**。包含 20 项 HiDPI、五种常规宽度浅深色、正常/reduced motion、200% 文字、原有状态流程及 2560px 骨架验证。
- 全仓 ESLint、四 workspace TypeScript、Admin production build 通过；完整单测 70 文件 / 336 项通过。
- 对比入口：`/tmp/admin-hidpi-review/index.html`，可切换页面、主题和逻辑视口；`before/`、`after/` 保存原图及测量数据。
- 浏览器由 fixture 拦截全部 API，不写生产 D1/R2。未声称实际显示器视觉接受、Safari/Firefox、读屏或生产管理员会话已验收。

## 文件职责

- `apps/admin/src/styles/globals.css`：黑白色阶、毛玻璃 token 与实底降级。
- `apps/admin/src/components/AdminLayout.tsx`：按页面用途限宽及紧凑标题区。
- `apps/admin/src/components/AdminSectionNav.tsx`：导航顶部和分组间距。
- `apps/admin/src/components/FloatingNotice.tsx`：通知使用统一毛玻璃表面。
- `apps/admin/src/components/AliasPanel.tsx`：保存条表面、原名列上限和行间距。
- `apps/admin/src/components/edit/SortableCharacterCard.tsx`：提供图卡容器尺寸。
- `apps/admin/src/components/edit/CommissionThumbnailGrid.tsx`：共用分栏及真实/骨架行高。
- `apps/admin/src/pages/AdminOverviewPage.tsx`：主操作容器分栏和最近作品行密度。
- `apps/admin/test/visual/ui-stability.spec.ts`：HiDPI、透明背景对比度、裁切和大屏骨架验收。
- `.impeccable.md`、根/Admin/test `AGENTS.md`：同步新的设计方向、模块和测试边界。
- `tasks/todo.md`、`tasks/lessons.md`：进度及本轮教训。
- `docs/admin-hidpi-review-2026-09-30.md`：本轮测量、前后对比及验证范围。
