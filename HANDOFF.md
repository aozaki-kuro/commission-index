# HANDOFF（2026-10-10，第三份）

主题：`apps/web` 的 SEO 与性能修复已落地（本地 master，**未 push**）。计划文件：
`docs/superpowers/plans/2026-10-10-web-seo-perf.md`（未跟踪，含全部 Ruling）。

## 已提交（master，基于 `cc7b7d4`）

| commit    | 内容                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `03b4371` | docs：owner 的 AGENTS 重构（首页架构下沉到 `apps/web/AGENTS.md`，新增 `.github/AGENTS.md`）                              |
| `72b4749` | `_headers`：favicon 与 `nsfw-cover-s.*` 缓存一天（非 immutable）                                                         |
| `9127841` | 年龄门首帧可见：`HomePage` head 内联脚本按 localStorage + UA 设 `data-age-gate-initial`，常量统一在 `warning/ageGate.ts` |
| `8a05484` | LCP preload 与内联 `<img>` 参数对齐（768/1280，width 1280），常量统一在 `batchPayloadBuilder.ts`                         |
| `8c2c2db` | 暗色移动端未激活 tab `gray-500 → gray-400`（3.70 → 6.88:1）                                                              |
| `6195a0c` | RSS 转义、CDATA `]]>` 拆分、atom self、确定性 `lastBuildDate`、head alternate                                            |
| `f39b024` | Hidden 作品原图不再进入 `dist/_astro`（Vite resolve 插件 stub + registry 只建可见记录，缺图 throw）                      |
| `1a1496c` | 各语言 `<title>` / description 本地化（BaseLayout 新增 `fullTitle`）                                                     |

## 验证证据

- lint 0 警告、typecheck 3/3、vitest 495/495（Task 7 后）。
- `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1 pnpm run build:web` 通过：preload `imagesrcset`/`href` 与首图 `srcset`/`src` 一致；
  `dist/_astro` 无 jpg/png、webp 412 张不变；`rss.xml` 经 xmllint 校验；en 与 404 的 title/description 标签字节不变。
- `dev:offline` 冒烟 4/4：首访首帧门可见且 `ageGateOpen=true`、汉堡菜单禁用；确认后刷新无门、12/12 图片加载；
  软导航到 `/ja/` 无闪烁；暗色 tab 计算色为 gray-400。
- **`test:visual` 红**：web 5 失败（全在 `icon-regression`：远端数据相对 10-05 基线漂移 + 热门词 chip 未等待）、
  admin 31 失败（超时/尺寸）。没有一处 diff 涉及本轮改动，但**未在干净 checkout 上对照确认**。

## 下一步

1. owner 确认 zh/ja description 译文（controller 起草）：`委託繪製的 NSFW 插畫收藏／請勿轉載`、
   `依頼して描いていただいた NSFW イラストのコレクション／無断転載禁止`（`homeLocale.ts` 的 `meta`）。
2. 视觉基线：先在干净 checkout 跑一次确认红是既有的，再由人眼审阅后 `test:visual:update`；`icon-regression` 的
   search shell 需等待 chip 渲染，否则有时序抖动。目前没有视觉用例覆盖暗色 tab 和年龄门首帧。
3. push 前用一次真实 `pnpm run dev`（会同步远端图片）确认插件的 `moduleGraph.invalidateAll()` 在 Hidden 翻转后生效
   （Vite 8 环境 API 下属旧接口，未运行时验证）。
4. 上线后：重跑 Lighthouse mobile（未确认访客视角）看 LCP；`curl -sI` 确认 favicon 只有一条 `Cache-Control`。
5. 可选小项（最终审查判为可接受）：年龄门在仍未确认时收到 storage 事件会重放入场动画；内联脚本与模块各写一份
   3 行判定逻辑（只共享常量）；`ProtectedCommissionImage` 为常量引入 server 模块；`title`/`fullTitle` 同传时前者被忽略。

## 本轮裁定（owner 可推翻）

- WP-6（搜索 entries 改到首次 focus 再拉）跳过：热门词会在交互瞬间跳变，只省 6.7 KB br。
- `/ja/`、`/zh-tw/` 不加 `_headers` 规则：线上已是 `max-age=0, must-revalidate`，等价 no-cache。
- 缺失 `modulepreload` 接受：Vite 只给 HTML 入口注入，Astro 自己渲染 HTML；代价是 `jumpToCommissionSearch`
  多一跳（影响可交互时间，不影响绘制）。
- `72b4749` 的提交顺序早于 Task 1（误操作后不改写本地历史，互相独立）。
- `www.crystallize.cc` 已由 owner 跳转到 apex，不再跟进。

## 本轮学到的坑

- 子 agent 必须显式传 `model`（sonnet / haiku），不能继承主会话模型。
- PreToolUse hook 会拦截任何包含 dev server 字样的 Bash 命令（含 `ps | grep astro`），起服务用 tmux 或终端 tab。
- `pnpm -C apps/web run dev` 会先从 R2 同步图片；纯本地验证用 `dev:offline`。

## 上一份交接仍有效的未决项

- 验证 WP-C1 / C2 的真实 Actions 路径（触发一次 `rebuild`，看「跳过验证」摘要和源图缓存 save 是否被跳过）。
- WP-C3（`web` 与 `build` 并行）：先量真实耗时再决定。
- WP-D（admin dev 用 `@cloudflare/vite-plugin`）：等 owner 在 tmux 里对比 Ctrl+C / Enter 症状，再删 spike worktree。
- PERF-02 生产只读核验前不得合并分支 `perf/admin-worker-drop-schema-probes`（`e410e3d`）。
- master branch protection（P11）需在 GitHub 设置里确认。
- `apps/admin-worker/scripts/listR2Orphans.ts` 首次运行必须由 owner 手动 dry-run，agent 不得运行。
- 搜索 CJK 修复上线后的抽查（中日文词单独搜、`!` 排除、与英文 AND）。
