# .github

CI and release workflows. Workspace, build-script and Cloudflare deploy rules live in the root `AGENTS.md`.

## CI（PR 校验；master 发布）

1. PR/master 执行 lint、全 workspace typecheck、单测，以及 admin UI Playwright（`test:admin-ui`，API fixture，无生产数据或凭证）
2. 用 `writeOfflineFactSource.ts` 把与视觉测试相同的离线 fixture 写入 `FACT_SOURCE_DIR=generated-fixture`（无生产凭证），
   Astro check 通过同一变量读取，再执行 admin build
3. master 部署依赖上述门禁；Web 获得共享环境锁后只导出一次，记录 SHA/revision
4. Astro check 与 Wrangler custom build 使用相同快照；部署前核对当前 master SHA，过期候选跳过
5. `ci.yml` web job 与 `rebuild.yml` 的候选校验/导出/校验/Astro check/构建部署序列统一放在
   `.github/actions/deploy-web-snapshot` 复合动作中，作为 step 运行在调用方 job 内（composite 而非 reusable
   workflow），因此 job 级 `concurrency` 锁仍覆盖整个 export->deploy 窗口；`rebuild` 无上游 build job，用
   `validate-code: true` 在锁内自校验，`ci.yml` 留默认 `false`。composite 无 `secrets` 上下文，两个 Cloudflare
   secret 通过 `with:` 以 input 传入

## master 保护（Ruleset `protect-master`）

GitHub 仓库设置（Settings → Rules，id 24860148），不随代码版本化；改动后在此同步。

- 规则：禁删除、禁 non-fast-forward、必须经 PR（所需批准数 0，单人仓库无法自审）、必需检查 `Validate & Build`
  （`strict_required_status_checks_policy: false`，不强制分支基于最新 master）
- bypass：仓库 admin 角色，`pull_request` 模式——只能在 PR 里强合，**不能直接 push master**
- 日常合并：`gh pr merge <PR> --auto --squash`；仓库已开 `allow_auto_merge` 与 `delete_branch_on_merge`。
  auto-merge 等到 `Validate & Build` 通过才合，合并后的 push 才触发 `web` / `admin` 部署
- 必需检查的 context 必须与 `ci.yml` 中 `build` job 的 `name:` 逐字一致；改名会让 PR 永远停在 "Expected"，
  需同步改 ruleset
- `Web — Snapshot & Deploy` / `Admin — Deploy` 只在 push master 运行（`if: github.event_name == 'push'`），
  不得设为必需检查，否则 PR 永远不可合并
- `GITHUB_TOKEN` 不在 bypass 名单内：新增 workflow 不得直接 push master，须走 PR 或显式加 bypass actor

## CI gotchas

- CI Web 与 rebuild 使用相同 concurrency group `release-web-production`；在锁内导出新数据，避免旧队列项携带
  旧数据快照覆盖新发布。Admin 使用独立的 `release-admin-production`
- required checks / 分支保护不在代码里，工作流文件本身不代表已启用；以下方「master 保护」为准，并用 `gh api repos/{owner}/{repo}/rulesets` 核验
- 内联脚本（`node --input-type=module` / heredoc / `-e`）的裸模块说明符从 cwd 解析；根 `package.json` 不依赖
  workspace 包，因此导入 `@commission-index/*` 的内联脚本必须把 `working-directory` 设到声明了该依赖的包
  （如 `apps/admin-worker`）
- Workflows sharing one `actions/cache` key must not run concurrently from the same push and each save —
  release workflows use their own cache namespace under the shared concurrency group
- 源图片缓存（`web-source-images-*`）只放在 `deploy-web-snapshot` 里、只由发布路径存取，namespace 与其它 job 隔离；
  restore key 是本 run id、以 `web-source-images-` 前缀命中最新 revision，save key 是内容 revision；当 restore 命中的
  key 已等于该 revision 时跳过 save（否则只会与已有 key 冲突）。复用的本地图片仍逐个按 D1 快照的 size/sha256 校验、
  不匹配即重下，manifest 之外的旧文件会被删除，绝不信任缓存字节
