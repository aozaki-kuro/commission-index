# HANDOFF（2026-10-11）

主题：web SEO / 性能修复已在 PR [#382](https://github.com/aozaki-kuro/commission-index/pull/382)（分支
`perf/web-seo-perf`，auto-fix 已开）。admin 视觉回归 31 个失败已在 `fix/visual-baselines` 收口（见「视觉问题」）。
计划文件 `docs/superpowers/plans/2026-10-10-web-seo-perf.md`（未跟踪，含全部 Ruling）。

## 进展

- PR #382 共 12 个提交（基于 `cc7b7d4`）：
  - `03b4371` owner 的 AGENTS 重构。
  - `72b4749` favicon / 封面缓存一天。
  - `9127841` 年龄门首帧可见。
  - `8a05484` LCP preload 对齐。
  - `8c2c2db` 暗色 tab 对比度。
  - `6195a0c` RSS 转义与元数据。
  - `f39b024` Hidden 原图不再进 `dist`。
  - `1a1496c` 各语言 title / description（译文 owner 已确认）。
  - `540466c` handoff。
  - `ba63af0` 修 CI：RSS 纯渲染拆到 `rssFeed.ts`，单测不再依赖 generated 数据。
  - `67890d8` web 视觉基线刷新 + 等待热门词 chip。
- 真实本地服务器验证（`dev:offline`，图片已全量在本地）：作品 272 改 Hidden 后从页面消失、逐字节恢复后带图回来，
  全程 0 报错。Hidden 原图 stub 插件和 watcher 的 `invalidateAll` 在本地 dev 下有效。
- web 视觉：11/11 通过。
  - `search-shell`、`mobile-home-shell` 原先是热门词 chip 竞态：`prepareStablePage` 现在会先 `waitForKeywordChips`
    （`#search-popular-keywords` 去掉 `.invisible`，且首个 `#search-keyword-list li` 可见）。
  - 3 张基线因数据漂移更新，尺寸不变，新旧图都已核对：`home-character-sidebar`、`mobile-hamburger-open`
    （`L*cia`/`n*yuta` → `Lucia`/`MUS1CA`），`mobile-language-menu-open`（背景卡片日期 `2026/03/21` → `2026/08/04`）。

## 视觉问题（下一轮的主题）

### admin：已收口（2026-10-11，`fix/visual-baselines`）

- 根因：spec 过期，不是环境问题。specs 落后于 `2939c7e`、`d734944` / `10fd8ad`、`89797f2`，且跑在错误的 Playwright 配置下。
- 修复：`be84ee5` / `c7f12a9` fixture 化（`mockAdminApi`），`0aea395` 旋转竞态，`7a1f2af` 数据就绪等待，`f9189db` 刷新 7 张基线，`0493590` 裁剪器 resize 重适配（产品修复）。
- 结果：`pnpm run test:visual` 42/42，`pnpm run test:admin-ui` 28/28。`undefined.replaceAll` 崩溃已定位：`formatCommissionPublicId`（`apps/admin/src/lib/commissionPresentation.ts`）← `getCommissionAccessibleLabel` ← `ThumbnailCard`（`CommissionThumbnailGrid.tsx`）。原因是 `crop lifecycle edit *` 测试内联 mock fixture 缺 `publicId`（fixture 早于 `2939c7e`），非产品 bug；由 `be84ee5` 共享类型化 fixture 与 `c7f12a9` 类型检查测试文件修复。

### web：已绿，但有两处结构性风险

- 基线是真实远端数据截图，**每次数据变化都会漂移**（这次 10-05 → 10-09 漂了 3 张）。已决定延后到固定 fixture 方案（见 open-issues「Verification gaps」R3；mask 不可行）。
- 没有视觉用例覆盖：暗色模式（如移动端 tab 的 gray-400）、年龄门首帧（所有视觉 spec 都预先确认了年龄）。

## 试过什么

- `VISUAL_OFFLINE=1` 只能用于冒烟：基线是真实数据，fixture 模式下截图必失败，**不能从它更新基线**。
- 视觉服务起来后如果被中断，会在 4173 / 8787 / 4174 留下孤儿进程；下次 run 会因 `reuseExistingServer` 复用到
  过期的服务。开跑前先 `lsof -nP -iTCP:4173 -sTCP:LISTEN` 等检查并清掉。
- 上一轮把所有 admin 失败都当成环境问题，没去核实，这正是下一轮要补的。

## 当前状态

- 当前分支 `fix/visual-baselines`，基于 master `ceb1292`，本分支 8 个提交（`9a76ac6` … `fe25242`），未推送，无 PR。
- 未跟踪：仅 `docs/superpowers/`。
- 本分支验证：`pnpm run test` 495/495；typecheck、lint 通过；`pnpm run test:visual` 42/42（admin 31 + web 11）；`pnpm run test:admin-ui` 28/28。
- PR #382 的提交已在 `origin/master`（`1af8293`）上；本地 master = `origin/master` + `ceb1292`（handoff 提交，未推送）。
- tmux 会话 `dev`（10-10 创建）一直开着，不是本轮的。

## 下一步（按优先级）

1. ~~admin `undefined.replaceAll` 崩溃~~：已收口。定位见上（测试 fixture 缺 `publicId`，非产品 bug）。
2. ~~干净 checkout 对照 master~~：以 `git log -S` 定位到每个失败选择器/标签的改动提交代替（均已在 master 上）。
3. ~~剩余超时逐个定性~~：已收口，均随 spec 与基线修复通过（含 `toBeCloseTo`）。
4. ~~人眼确认 admin 截图差异~~：已收口，`f9189db` 刷新 7 张 admin 基线（壳层布局变化）。
5. web 视觉数据漂移：已决定延后，记录于 `docs/open-issues.md`「Verification gaps」（R3）。暗色模式与年龄门首帧仍是未做的 wishlist，不属于本轮。
6. PR #382 合并后：重跑 Lighthouse mobile（未确认访客）看 LCP；`curl -sI` 一个 favicon，确认只有一条 `Cache-Control`。

## 本轮学到的坑

- 子 agent 必须显式传 `model`（sonnet / haiku），不能继承主会话的 Opus。
- PreToolUse hook 会拦截任何带 dev server 字样的 Bash 命令（`ps | grep astro`、heredoc 里写到 "dev" 都会被拦），
  服务用 tmux 或终端 tab 起，长文本用 Write 写文件。
- `pnpm -C apps/web run dev` 会先从 R2 同步图片；纯本地验证用 `dev:offline`。
- 引入 `@data/*` 的模块在加载时就读 generated 数据；单测要测的纯逻辑必须放在不 import `@data/*` 的文件里，否则 CI 挂。
- macOS 自带 bash 3 没有 `mapfile`；zsh 不会对 `$var` 做分词，脚本要显式用 bash 跑。

## 上一份交接仍有效的未决项

- 验证 WP-C1 / C2 的真实 Actions 路径（触发一次 `rebuild`，看「跳过验证」摘要和源图缓存 save 是否被跳过）。
- WP-C3（`web` 与 `build` 并行）：先量真实耗时再决定。
- WP-D（admin dev 用 `@cloudflare/vite-plugin`）：等 owner 在 tmux 里对比 Ctrl+C / Enter 症状，再删 spike worktree。
- PERF-02 生产只读核验前不得合并分支 `perf/admin-worker-drop-schema-probes`（`e410e3d`）。
- master branch protection（P11）需在 GitHub 设置里确认。
- `apps/admin-worker/scripts/listR2Orphans.ts` 首次运行必须由 owner 手动 dry-run，agent 不得运行。
- 搜索 CJK 修复上线后的抽查（中日文词单独搜、`!` 排除、与英文 AND）。
