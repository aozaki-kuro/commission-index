# Admin 页面边界与角色状态一致性（2026-09-30）

分支 `redesign/admin-workspace`。按用户纠偏，使用 Impeccable 的 critique、normalize、clarify 和 frontend-design 规划与修复；保留此前黑白灰、适量毛玻璃与完整维护功能。

## 设计审查与规格

原设计没有遍地玻璃或装饰性指标，但两处交互意图表达失败：

- 状态灰色圆点没有可见含义，并被 `aria-hidden` 隐藏。它容易被理解为在线状态；分界又把领域 `archived` 写成 Stale，与 Overview 和公站用语不一致。改为持续可见的 Active / Archived，改名与排序仍保留文字。Archived 对应公站默认折叠的角色，数据并未隐藏或删除。
- 五种页面使用 1120–1600px 的居中上限，切页会同时移动标题和表面边界。不同任务的字段长度可以不同，但导航后的空间定位应保持一致。移除按页面选宽映射，统一 1600px 外壳，内含原有 padding；标题、分隔线、主要表面与工具栏遵循同一左右边界。

Create 的图片预览列在宽容器内限制为 24rem，字段依旧通过容器查询组织。没有把整个表单再次居中限宽，也没有降低字体来填满首屏。Edit 保留真实/骨架共用的 2–5 列网格，角色状态继续取当前分界位置，而非已过期的角色对象。

分界显示 Archived 数量，排序提示说明上下移动的结果。移动端状态在姓名下方显示，不能压缩 44px 操作目标；原有 `data-character-status`、`data-stale-divider`、展开、改名、删除和排序契约不变。

浏览器额外验证 320px/200% 字体后，发现品牌/公站链接同排与关键词替换入口的最小宽度溢出。导航允许自然换行，入口限制在可用宽度并保留完整换行文案。角色头在 `thumbnails` 容器不足 16rem 时分成姓名/状态与计数/操作两排；真实头与初始骨架共用结构，不能沿用旧 66px 固定占位。

## 验收计划

- 浏览器以 DPR2 的 1280×720 和 2560×1440 CSS 视口，在浅深色主题下连续点击导航遍历五页，量测主区、标题、标题线和内容左右边界；相差不超过 1px，并确认没有整页卸载。
- 320/1280px 下检查正常、改名、取消和跨分界排序；状态文字立即更新，归档/恢复请求和当前文字一致。
- 长名称、Archived、200% 字体检查状态与操作不裁切；保留此前 HiDPI 对比度、移动布局、加载几何和业务交互回归。
- lint、Admin TypeScript、production build、相关单测；完全模拟 API，不启动生产绑定 Worker。

## 文件职责

```text
apps/admin/src/components/
  AdminLayout.tsx                    统一外壳与标题边界
  AdminSectionNav.tsx                窄屏放大文字时导航顶行换行
  create/AddCommissionForm.tsx        内部图片列宽与原有表单
  edit/SortableCharacterCard.tsx      持续可见的角色状态与共用骨架
  edit/SortableDivider.tsx            归档分界与数量
  edit/CommissionManager.tsx          状态含义与排序提示
  edit/KeywordReplacePopover.tsx      替换入口文案随可用宽度换行
apps/admin/test/visual/
  ui-stability.spec.ts                连续切页和状态回归
```

设计上下文、根/Admin/test AGENTS 与任务记录同步本次规则。不改变 Worker/API/schema、裁剪输出或数据状态规则。

## 验收结果

- 最终 `mise exec -- pnpm run test:admin-ui`：**75 项通过，1.9m**。包含此前全部交互/几何回归、新增 4 项连续导航、2 项窄屏长名称/放大状态、3 项冷加载角色头，以及扩展后的归档/恢复请求断言。
- 四项连续导航中，五页标题/分隔线/主表面左右边界偏差均为 **0px**，前后保持同一 Document，beforeunload 均为 0。

```text
CSS 视口      五页主区宽度    内容左边界    内容右边界
1280 × 720    1072px         248px         1240px
2560 × 1440   1600px         624px         2144px
```

以上均为 DPR2，浅深色一致；主区宽度包含 padding，内容边界不含 padding。1600px 为统一上限，不要求小视口横向溢出到该尺寸。

- 冷加载角色头的真实/骨架高度：1280px 正常字号 **66/66px**、320px 正常字号 **80/80px**、320px 200% 字号 **254/254px**，宽度也一致。
- 状态文字已加入对比度样本；20 项 HiDPI 场景最低正文样本仍为 **5.08:1**。主线程复核大屏 Edit/Create 与深色移动放大截图；清晰的文本和空间分排承担状态表达，不依赖色差。
- `mise exec -- pnpm run test`：70 文件 / **336 项通过**；全仓 ESLint、Admin TypeScript、production build 和 diff 空白检查通过。构建保留既有 Radix `use client` 指令提示；单测 jsdom 保留既有 scrollTo 未实现日志，实际滚动恢复由 Chromium 通过验证。
- 前后对比与原始测量：`/tmp/admin-consistency-review/index.html`，含 40 张 HiDPI 前后场景、4 组连续导航、2 张窄屏放大截图和 3 组骨架几何。此前 HiDPI 对比页保持历史版本。

测试期间曾发现初始 about:blank 离开被计为切页卸载，现将监听安装在首次应用导航后。动画等待改为有界轮询当前运行的有限动画；[Animation.finished](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished) 随播放状态变化具有生命周期，不能把跨状态等待当作稳定几何证据。本轮未删除产品动效，正常/reduced motion 旧回归均保留并通过。

上述验收期间全部 API 为本地 fixture，没有生产 D1/R2 写入。不把浏览器 DPR 模拟、指定样本对比度视为实际显示器接受或整页 WCAG 认证。

## 提交前审查与测试收敛

- 修复 Aliases 未选中标签数量对比度不足，以及改名成功后的旧 bootstrap 撤销在途归档。后者先在旧代码稳定复现失败，再验证修复；只在排序请求在途时保留本地顺序/分界，元数据仍合并，最新请求终结后恢复正常刷新，不自动重试写入。
- 按用户要求删除尺寸/主题/数量的重复组合：HiDPI 页面检查合入两项连续导航，移动保留单个全页面场景，网格仅保留空、跨行、宽屏长列表；删去常驻通用对比度/指标采集器。完整 75 项验收及截图已完成，留作历史审计证据，不作为持续测试规模。
- 异步状态测试合并重复的串行改名、归档和回调场景，相关 31 项收敛为 26 项。全仓单测 70 文件 / 334 项通过；保留取消误提交、草稿隔离、旧刷新、最新回调及失败恢复。
- 持续浏览器套件收敛为 28 项，最终全部通过（40.3s），截图历史仍位于 `/tmp/admin-consistency-review/index.html`。Node 24 显式固定为 `mise exec node@24.21.0 --`；全仓 lint、四 workspace 无缓存 typecheck 和 Admin production build 通过。
- 用户授权合并至 `master`；远端 `5c90182` 的 pnpm 12.8.1 升级保留。提交、合并和远端/CI 核验以最终 Git 及 `/tmp/admin-publish-result.json` 为准。
