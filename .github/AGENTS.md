# .github

CI and release workflows. Workspace, build-script and Cloudflare deploy rules live in the root `AGENTS.md`.

## CI（PR 校验；master 发布）

1. PR/master 执行 lint、全 workspace typecheck、单测
2. 生成无生产凭证的离线 fixture，执行 Astro check 和 admin build
3. master 部署依赖上述门禁；Web 获得共享环境锁后只导出一次，记录 SHA/revision
4. Astro check 与 Wrangler custom build 使用相同快照；部署前核对当前 master SHA，过期候选跳过
5. `ci.yml` web job 与 `rebuild.yml` 的候选校验/导出/校验/Astro check/构建部署序列统一放在
   `.github/actions/deploy-web-snapshot` 复合动作中，作为 step 运行在调用方 job 内（composite 而非 reusable
   workflow），因此 job 级 `concurrency` 锁仍覆盖整个 export->deploy 窗口；`rebuild` 无上游 build job，用
   `validate-code: true` 在锁内自校验，`ci.yml` 留默认 `false`。composite 无 `secrets` 上下文，两个 Cloudflare
   secret 通过 `with:` 以 input 传入

## CI gotchas

- CI Web 与 rebuild 使用相同 concurrency group `release-web-production`；在锁内导出新数据，避免旧队列项携带
  旧数据快照覆盖新发布。Admin 使用独立的 `release-admin-production`
- required checks / 分支保护需要在 GitHub 仓库设置中另行核验，工作流文件本身不代表已启用
- 内联脚本（`node --input-type=module` / heredoc / `-e`）的裸模块说明符从 cwd 解析；根 `package.json` 不依赖
  workspace 包，因此导入 `@commission-index/*` 的内联脚本必须把 `working-directory` 设到声明了该依赖的包
  （如 `apps/admin-worker`）
- Workflows sharing one `actions/cache` key must not run concurrently from the same push and each save —
  release workflows use their own cache namespace under the shared concurrency group
- 源图片缓存（`web-source-images-*`）只放在 `deploy-web-snapshot` 里、只由发布路径存取，namespace 与其它 job 隔离；
  restore key 是本 run id、以 `web-source-images-` 前缀命中最新 revision，save key 是内容 revision；当 restore 命中的
  key 已等于该 revision 时跳过 save（否则只会与已有 key 冲突）。复用的本地图片仍逐个按 D1 快照的 size/sha256 校验、
  不匹配即重下，manifest 之外的旧文件会被删除，绝不信任缓存字节
