# AGENTS

本目录承载首页搜索交互的 React 侧逻辑，目标是：稳定首屏、精确筛选、最小化交互回归。

## 目录结构

```text
src/features/home/search/
├── AGENTS.md
├── CommissionSearch.tsx
├── CommissionSearch.test.tsx
├── CommissionSearchDeferred.tsx
├── CommissionSearchDeferred.test.tsx
├── CommissionSearchHelpPopover.tsx
├── CommissionSearchSuggestionDropdown.tsx
├── PopularKeywordsRow.tsx
├── commissionSearchIndex.ts
├── useCommissionSearchDomSync.ts
├── useCommissionSearchModel.ts
├── useSearchPanelLoadedState.ts
└── useSuggestionPanelController.ts
```

## 文件职责

- `CommissionSearch.tsx`：搜索壳层与状态编排；负责 query、索引 hydration、analytics 与子模块装配。
- `commissionSearchIndex.ts`：搜索索引构建、DOM 上下文采集、可见性指标统计、suggestion 相关词聚合；保持纯函数导向。
- `useCommissionSearchDomSync.ts`：同步 DOM 过滤结果、section/stale divider 可见性与 live region 文案；不要在这里改 suggestion 规则。
- `useCommissionSearchModel.ts`：聚合 query、索引 hydration、suggestion 派生、状态文案与搜索 analytics；让主组件只保留交互装配。
- `CommissionSearchSuggestionDropdown.tsx`：建议下拉与隐藏 stale 提示的纯渲染；保持现有 DOM 结构、class 与 `cmdk` 语义稳定。
- `useSearchPanelLoadedState.ts`：订阅 character/timeline 面板加载状态；只处理 DOM 读数与事件桥接，不混入 UI 决策。
- `useSuggestionPanelController.ts`：管理下拉关闭、外部点击、全局 Escape、程序性回焦抑制；不要在这里改搜索结果逻辑。
- `CommissionSearchDeferred.tsx`：延迟索引初始化封装；保持与主搜索壳层一致的输出契约。
- `CommissionSearchHelpPopover.tsx`：搜索帮助弹层内容；只承载说明文案与结构。
- `PopularKeywordsRow.tsx`：热门关键词快捷入口；只负责按钮呈现与触发。
- `*.test.tsx`：锁定搜索交互、suggestion 行为、stale/timeline 边界条件。

## 依赖边界

- `CommissionSearch.tsx` 允许依赖本目录内 hook / 纯渲染组件 / 纯工具模块。
- hook 文件不得反向依赖 `CommissionSearch.tsx`。
- 纯渲染组件不得直接读取 `window` / `document`。
- `commissionSearchIndex.ts` 保持无 React 依赖，专注索引与派生数据。
- `useCommissionSearchModel.ts` 允许依赖 React hook、搜索算法与 DOM sync hook，但不要直接渲染 UI。
- 搜索逻辑继续依赖 `#lib/search/index` 作为单一算法来源，避免在 UI 层复制筛选规则。

## 修改守则

- 保持搜索框、下拉、隐藏 stale 提示的 DOM 结构与 className 稳定，避免布局跳动。
- 任何 suggestion / stale / timeline 交互修改，都必须补或更新回归测试。
- 若新增状态，优先先问：它能否归入已有 hook，而不是继续堆进 `CommissionSearch.tsx`。
- 若新增纯派生逻辑，优先放入 `commissionSearchIndex.ts` 这类无 React 模块，避免组件再次膨胀。

## 变更记录

- 将 suggestion 面板控制、面板加载状态订阅、建议下拉渲染从 `CommissionSearch.tsx` 中拆分为独立模块，以降低单文件复杂度，同时保持交互与布局契约不变。
- 继续将搜索索引构建、相关词聚合、DOM 过滤副作用从 `CommissionSearch.tsx` 中拆出，主文件只保留状态编排与交互装配。
- 新增 `useCommissionSearchModel.ts`，把 query / index / suggestion 派生链与搜索埋点从主组件抽离。
