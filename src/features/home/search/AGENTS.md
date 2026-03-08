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
├── useSearchPanelLoadedState.ts
└── useSuggestionPanelController.ts
```

## 文件职责

- `CommissionSearch.tsx`：搜索壳层与状态编排；负责 query、索引、DOM 过滤、analytics 与子模块装配。
- `CommissionSearchSuggestionDropdown.tsx`：建议下拉与隐藏 stale 提示的纯渲染；保持现有 DOM 结构、class 与 `cmdk` 语义稳定。
- `useSearchPanelLoadedState.ts`：订阅 character/timeline 面板加载状态；只处理 DOM 读数与事件桥接，不混入 UI 决策。
- `useSuggestionPanelController.ts`：管理下拉关闭、外部点击、全局 Escape、程序性回焦抑制；不要在这里改搜索结果逻辑。
- `CommissionSearchDeferred.tsx`：延迟索引初始化封装；保持与主搜索壳层一致的输出契约。
- `CommissionSearchHelpPopover.tsx`：搜索帮助弹层内容；只承载说明文案与结构。
- `PopularKeywordsRow.tsx`：热门关键词快捷入口；只负责按钮呈现与触发。
- `*.test.tsx`：锁定搜索交互、suggestion 行为、stale/timeline 边界条件。

## 依赖边界

- `CommissionSearch.tsx` 允许依赖本目录内 hook / 纯渲染组件。
- hook 文件不得反向依赖 `CommissionSearch.tsx`。
- 纯渲染组件不得直接读取 `window` / `document`。
- 搜索逻辑继续依赖 `#lib/search/index` 作为单一算法来源，避免在 UI 层复制筛选规则。

## 修改守则

- 保持搜索框、下拉、隐藏 stale 提示的 DOM 结构与 className 稳定，避免布局跳动。
- 任何 suggestion / stale / timeline 交互修改，都必须补或更新回归测试。
- 若新增状态，优先先问：它能否归入已有 hook，而不是继续堆进 `CommissionSearch.tsx`。

## 变更记录

- 将 suggestion 面板控制、面板加载状态订阅、建议下拉渲染从 `CommissionSearch.tsx` 中拆分为独立模块，以降低单文件复杂度，同时保持交互与布局契约不变。
