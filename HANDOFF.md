# HANDOFF（2026-10-11）

主题：web SEO / 性能修复已在 PR [#382](https://github.com/aozaki-kuro/commission-index/pull/382)（分支
`perf/web-seo-perf`，auto-fix 已开）。**下一轮单开：admin 视觉回归 31 个失败。**
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

### admin：31 个失败，未查根因，基线未动

本轮没有改 admin 代码，所以失败与 PR #382 无关；但「环境问题」只是推测，**没有在干净 checkout 上对照过**。

失败分布（来自 `test-results/playwright` 目录名，可能混有旧 run，用前重跑核对）：

- `ui-stability.spec.ts`：约 19 个，包括 character grid、cold character / create、HiDPI 2560x1440 / 1280x720、
  mobile workspace、reload restore、alias tabs、edit aligns 等。
- `admin-create.spec.ts`：约 15 个，包括 crop lifecycle（reduce / no-preference × Use image / Escape / Close / Cancel）、
  crop dialog、source image、new character、overview、nav switch、create page visual。
- `admin-edit.spec.ts`：3 个（replacement crop、edit page / manager visual）。
- `aliases-ui.spec.ts`：alias sections；`admin-aliases.spec.ts`：dashboard visual；`admin-suggestion.spec.ts`：featured。

症状分类：

1. 30 s `waitFor` / `click` 超时（占大多数）。
2. 4 个 `toBeCloseTo` 数值断言失败（布局对齐类）。
3. 3 个截图不一致。
4. **`Admin route failed to render ... undefined.replaceAll`**：admin 页面在远端数据下渲染崩溃。这条最可疑，像真 bug
   而不是环境问题，很可能是一批超时的上游原因（页面没渲染出来，后续 `waitFor` 自然超时）。

### web：已绿，但有两处结构性风险

- 基线是真实远端数据截图，**每次数据变化都会漂移**（这次 10-05 → 10-09 漂了 3 张）。可考虑让 web 视觉用固定
  fixture，或者把易变文本区域 mask 掉。
- 没有视觉用例覆盖：暗色模式（如移动端 tab 的 gray-400）、年龄门首帧（所有视觉 spec 都预先确认了年龄）。

## 试过什么

- `VISUAL_OFFLINE=1` 只能用于冒烟：基线是真实数据，fixture 模式下截图必失败，**不能从它更新基线**。
- 视觉服务起来后如果被中断，会在 4173 / 8787 / 4174 留下孤儿进程；下次 run 会因 `reuseExistingServer` 复用到
  过期的服务。开跑前先 `lsof -nP -iTCP:4173 -sTCP:LISTEN` 等检查并清掉。
- 上一轮把所有 admin 失败都当成环境问题，没去核实，这正是下一轮要补的。

## 当前状态

- 当前分支 `perf/web-seo-perf` = `origin/perf/web-seo-perf`（HEAD `67890d8`）。PR CI 在跑，前一轮 `Validate & Build`
  的失败已由 `ba63af0` 修掉。
- 本地 lint / typecheck / test 全绿（495/495）；`build:web`（已有快照）通过。
- 未提交：仅本文件和未跟踪的 `docs/superpowers/`。
- 本地 `master` 比 `origin/master` 多 PR 里的 10 个提交；PR 合并后要同步回 `origin/master`（如果 squash 合并，同步时会
  丢掉这些本地提交，届时先确认）。
- tmux 会话 `dev`（10-10 创建）一直开着，不是本轮的。

## 下一步（按优先级）

1. **admin `undefined.replaceAll` 崩溃**：在 `apps/admin/src` 找 `.replaceAll(` 调用，看哪个字段在远端数据里可能是
   `undefined`（可选字段、新列、bootstrap 结构变化），再用 `pnpm run dev:admin` 复现。先修它，再看超时剩多少。
2. 在干净 checkout（`git worktree add` 到 `origin/master`）跑一次 admin 视觉，确认这 31 个失败在 master 上是否本来就有。
3. 剩下的超时逐个定性：worker bootstrap 是不是太慢（远端 D1）？还是 spec 在等一个不再存在的元素？
   `toBeCloseTo` 失败对照最近的 admin UI 改动（如 `1e92e26` 编辑搜索缩略图）。
4. 人眼确认 admin 3 处截图差异，桌面和移动都看过，再决定是否更新基线。
5. web 视觉的数据漂移：决定用 fixture 还是 mask；可顺手补暗色和年龄门首帧的用例。
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
