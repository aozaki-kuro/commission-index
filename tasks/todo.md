# 统一迁移状态板（2026-03-18）

## 本轮执行切片（2026-09-10 pnpm 跟进与 admin 部署）

- [x] 将本地裁剪提交 rebase 到最新 `origin/master`，不使用强推
- [x] 全仓扫描旧式 `pnpm run --cwd` / `--dir` / `--prefix` 调用，确认无遗漏
- [x] 将 Playwright 三个 workspace 服务命令统一为 `pnpm -C <dir> run ...`
- [x] 按当前 lint 规则补齐 `minimumReleaseAgeExcludePrune: true` 并规范 workspace YAML 顺序
- [x] 串行重跑 frozen install、lint、typecheck、Vitest 与 admin build
- [ ] 提交并推送 pnpm 配置跟进
- [ ] 部署 admin Worker，并用健康检查与线上静态资源验证发布结果

### Review

- 待部署完成后补充。

## 本轮执行切片（2026-09-10 admin 源图裁剪）

### 规格与边界

- [x] 只读盘点 admin 新建/替换图片入口、R2 上传链路、展示比例与现有 Dialog 约束
- [x] 核对裁剪库当前版本、React 19 兼容性、无白边边界与 modal 动画限制
- [x] 确认设计上下文与实施假设：单人内容维护、英文界面、现有克制灰阶风格、浅/深双主题、桌面与触控窄屏
- [x] 新增共享图片处理模块：精确输出 1280×525 JPEG，质量 0.95，透明区域铺白，异常可恢复
- [x] 新增可访问、响应式的 Radix 裁剪 Dialog：固定比例、拖动、缩放、连续任意角旋转、重置、处理状态
- [x] 实现旋转多边形的最小缩放与位移夹取，不依赖外接矩形，保证任意角度下裁剪框四角都在图像内
- [x] 接入新建 commission 表单：保留原文件名自动填充，表单只提交裁剪后的 JPEG
- [x] 接入编辑 commission 替换链路：裁剪确认后才上传，保留现有状态提示与预览 cache-bust
- [x] 对低于目标有效裁剪像素的源图给出清晰警告，允许用户明确确认后上采样，不静默降质
- [x] 补纯处理逻辑/组件回归与 Playwright 视觉用例，覆盖横图、竖图、PNG、旋转、取消、窄屏与 200% 文字缩放
- [x] 同步 `apps/admin/AGENTS.md` 的新模块边界；不改 admin API 合同
- [x] 串行运行 install、lint、typecheck、Vitest、admin build 和受影响的 Playwright 视觉验证

### Review

- [x] `react-easy-crop@6.2.3` 只负责手势与固定裁剪框；本地几何层统一约束任意角旋转后的最小缩放和图像局部坐标位移，避免四角露白。
- [x] 创建与编辑共用 `ImageCropDialog` / `imageCrop.ts`，现有 Worker API、R2 key、D1 schema 和 cache-bust 合同均未改变。
- [x] `pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run typecheck`、全量 41 个 Vitest 文件 / 210 个测试、`pnpm run build:admin` 全部通过。
- [x] Playwright 创建页 6 个原有/新增用例通过；额外纵图取消用例通过；编辑替换用例在 37° 旋转后确认 multipart 为 `.jpg` / `image/jpeg`，并拦截请求避免写入远端。
- [x] 已人工复核桌面与 390×844 移动端基线；固定框、缩放/旋转滑杆和首屏确认按钮均可用，200% 根字号下关键控件仍在视口。
- [ ] `admin-edit.spec.ts` 的两个既有静态截图仍因远端 commission 数量改变导致基线高度漂移，其中整页 element screenshot 还触发 5 秒稳定等待；这两个失败与未打开时不渲染的裁剪 Dialog 无关，未用本功能更新掩盖远端数据基线。

## 本轮提交收口（2026-08-16）

- [x] 审计 untracked/ignored/build artifacts，仅补充仓库根 `.pnpm-store/` 忽略规则
- [x] 确认依赖升级相关测试、类型检查、构建与 smoke 已完成，不重复执行
- [x] 复核最终 diff、peer/lockfile 状态与提交范围
- [x] 按提交规范暂存并提交本轮依赖升级
- [x] 推送当前 `master` 到 `origin/master` 并确认远端状态

## 本轮执行切片（2026-08-16 pnpm 全量依赖升级）

### 规格与边界

- [x] 只读盘点所有 workspace 的直接依赖、锁文件解析版本、pnpm/Node 约束与现有验证门禁
- [x] 使用 `pnpm outdated -r --format json` 核对 registry 最新版本，并查阅 Astro 7、TypeScript 7、eslint-plugin-astro 3 的官方迁移约束
- [x] 在升级前完成 main 基线：lint、typecheck、40 个 Vitest 文件 / 207 个测试、admin build、Astro check 全部通过
- [x] 先用 `pnpm update -r --latest` 暴露真实兼容边界，再按 peer 冲突和验证结果仅回退不兼容单包
- [x] 处理升级实际暴露的兼容问题；重点覆盖 Astro 7 / Vite 8 配置、TypeScript 7 已移除选项、ESLint Astro 3 peer 约束、jsdom 30 与 jest-dom 7 测试行为
- [x] 保持 Node 24 运行时、Cloudflare binding/API、业务逻辑与页面行为不变；TypeScript 7 / Node 26 types 等若被现有工具链或运行时边界阻塞，退回最新兼容版本并记录证据
- [x] 更新根 `AGENTS.md` 与 `apps/web/AGENTS.md` 中会因 Astro 7 / Vite 8 等版本变化而过时的技术栈和 guardrail
- [x] 运行 `pnpm install --frozen-lockfile`、lint、typecheck、全量 Vitest、admin build、Astro check/build；可用时补 Wrangler dry-run 与本地 smoke
- [x] 复核 `git diff --check`、依赖 diff、peer/engine 警告和 `pnpm outdated -r`，确认没有漏升或无关改动

### Review

- `pnpm update -r --latest` 已升级所有 workspace 的直接依赖；最终 `pnpm outdated -r` 只剩 TypeScript 7 与 `@types/node` 26 两项有意保留版本。
- TypeScript 7.0.2 同时违反 `@astrojs/check@0.9.10` 的 `^5 || ^6` 与 `typescript-eslint@8.67.0` 的 `<6.1.0` peer 区间，因此根与 domain 保留 6.0.3；Node types 改为与 mise Node 24 对齐的 24.13.3。
- Astro 已从 6.4.8 升到 7.2.2；web 配置删除 Vite 7 类型强转与无效局部 override，并将 `build.rollupOptions` 迁移到 Vite 8 的 `build.rolldownOptions`。
- `pnpm peers check` 无问题；frozen install、lint、四 workspace typecheck、40 个 Vitest 文件 / 207 个测试、admin build、Astro 178 文件诊断、Astro production build、admin Wrangler dry-run 均通过。
- Astro preview smoke：`/`、`/zh-tw/`、`/ja/`、search JSON 均为 200，`/admin` 为 404；preview 进程已停止。
- `pnpm run build:all` 的 admin build 通过，web 远程事实源导出因当前环境未设置 `CLOUDFLARE_API_TOKEN` 停止；已用现有 generated 输入单独完成 Astro 7 production build，不把缺凭证路径计作通过。
- 升级前后测试数量一致，admin production 产物文件名与大小一致；`git diff --check` 通过，无业务/API 改动。

## 本轮执行切片（2026-04-25 featured keyword 首次点击滚动修复）

- [x] 定位 featured keyword 点击链路与首次初始化副作用
- [x] 暂缓未加载 active 批次下的首次 DOM 过滤，避免首屏索引误收缩页面
- [x] 补针对性测试并验证搜索回归

### Review

- 根因：首次 keyword 搜索在 active deferred 批次未加载时，立即用不完整 DOM 上下文过滤列表，可能把当前页面主体收缩到浏览器只能夹回顶部。
- 修复：首次有 query 且 active 未加载时先请求 active 全量加载，并暂停该帧 DOM 过滤；批次加载完成后的 panel state 更新会恢复正常过滤。
- 验证：`bun run test apps/web/src/features/home/search/commissionSearchController.test.ts`、`bun run test apps/web/src/features/home/search`、`bun run lint`、`bun run typecheck` 均通过。
- 追加修复：`Blue Archive` 属于 archived-only 命中；过滤必须等 archived 展开/加载请求先拿到正确 scroll position，否则页面先收缩再 preserve，会保存到错误的顶部位置。
- 追加验证：本地 Astro dev + Playwright 触发 `Blue Archive` 查询，滚动没有回到顶部。

## 本轮执行切片（2026-04-09 CLAUDE.md -> AGENTS.md 迁移）

- [x] 盘点仓库内现有分层 `CLAUDE.md`，确认迁移范围并排除外部目录
- [x] 为各层目录新增等价 `AGENTS.md`，将其设为新的 agent 文档真值
- [x] 将原 `CLAUDE.md` 收口为兼容入口，明确指向同目录 `AGENTS.md`
- [x] 校验迁移后的文件映射，确认不存在遗漏层级

## 本轮执行切片（2026-03-25 Want this 跨视图状态同步）

- [x] 复盘首页 `Want this` 在 Character / Date 双视图下的状态键与按钮挂载方式，确认根因
- [x] 修复同一条 commission 在多处渲染时的 `Recorded` 状态同步
- [x] 补针对性测试并验证跨视图回归

## 本轮执行切片（2026-03-25 web typecheck 配置减脂）

- [x] 复盘 `apps/web/tsconfig.typecheck.json` 是否仍有存在必要，并确认当前 `tsconfig.json` 可直接用于 `tsc --noEmit`
- [x] 将 `apps/web` workspace 的 `typecheck` 脚本切回 `tsconfig.json`
- [x] 删除不再需要的 `apps/web/tsconfig.typecheck.json`
- [x] 跑仓库级 `typecheck`，确认 Turbo 工作区校验链路无回归

## 本轮执行切片（2026-03-25 本地 Turbo Astro 构建缓存拆链）

- [x] 复盘 `apps/web` 当前 `build/check` 为什么把事实源导出和 Astro 构建绑在同一个 Turbo task 里
- [x] 把 `fact-source:export` 提升为 Turbo 独立任务，并让 `build/check` 只保留 Astro 自身职责
- [x] 跑两轮本地验证，确认 `fact-source:export` 与 `build` 都能稳定命中本地 Turbo cache

## 本轮执行切片（2026-03-23 timeline 切换后滚动 reveal 动画修复）

- [x] 复盘 `character -> timeline` 与“刷新直进 timeline”两条初始化路径的 reveal 时序差异
- [x] 修复隐藏 timeline 面板被提前标记为 revealed 的问题，并补可见性切换后的重扫
- [x] 补针对性测试并验证切换后滚动动画回归

## 本轮执行切片（2026-03-23 Git 历史清理评估）

- [x] 盘点当前工作区、远端、分支与对象体量，确认是否适合整仓重写
- [x] 梳理哪些远端 refs 仍会保留旧历史，确认“只重写 master”是否足够
- [x] 输出风险评估与执行方案，等待用户确认是否执行不可逆操作

## 本轮执行切片（2026-03-23 Git 历史重写落地）

- [x] 基于当前工作树创建新的根提交，仅保留当前版本
- [x] 强推覆盖远端 `master`
- [x] 删除仍会保活旧历史的远端分支，并 prune 本地 remote-tracking refs
- [x] 清理本地 reflog 与悬空对象，降低旧历史残留

## 本轮执行切片（2026-03-23 空角色导航灰态）

- [x] 梳理首页 Character List / 汉堡菜单当前“不可点击灰态”复用点，确认空角色为何仍可点击
- [x] 收紧导航链接可用性判定，让 0 commission 的角色复用过滤后灰态
- [x] 补针对性测试并验证侧栏/汉堡菜单行为

## 本轮执行切片（2026-03-23 GitHub Actions Astro/Turbo 构建缓存）

- [x] 梳理 deploy/rebuild workflow 当前为什么没有真正复用 `.turbo` 与 Astro 构建产物
- [x] 给 GitHub Actions 的 deploy/rebuild 补上 `.turbo` restore/save，并把 cache hit 写进 summary
- [x] 让 `wrangler` custom build 改走 repo-root Turbo，确保 Actions 里的 web/admin 构建真的能命中 Turbo
- [x] 给 web build 增加远端事实源版本戳，避免 `admin-data-changed` 重建误吃到旧 Turbo 缓存
- [x] 更新仓库文档，明确 GitHub Actions 与远端事实源缓存的边界
- [x] 跑针对性验证，确认配置无语法错误且不会引入脏缓存

## 本轮执行切片（2026-03-23 Turbo strict env 透传修复）

- [x] 复盘 `wrangler deploy -> turbo -> apps/web#build` 为什么在 Actions 里丢失 Cloudflare 凭证
- [x] 给 Turbo `build` 任务补 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` passthrough
- [x] 跑 dry-run 验证 Turbo 任务环境里已包含 passthrough 声明

## 本轮执行切片（2026-03-23 GitHub Actions deploy/cache 并发收口）

- [x] 复盘 `ci.yml` 与 `deploy.yml` 为什么会同时抢 `.turbo` cache key
- [x] 把 `deploy.yml` 改成等待 `CI` 成功后再触发，避免 push 后验证/部署并行抢跑
- [x] 给 `deploy.yml` / `rebuild.yml` 加共享 release concurrency，避免发布链互相重叠
- [x] 同步更新仓库文档与 lessons，写清 workflow trigger 与 turbo cache 锁约束
- [x] 跑 YAML 级校验，确认 workflow 语法与关键表达式成立

## 本轮执行切片（2026-03-23 admin dev 启动竞态修复）

- [x] 复现 `bun run dev:admin` 首次启动时 worker/front-end 抢跑导致的远端数据加载异常
- [x] 让根级 admin dev 编排在 worker 远端数据接口 ready 后再启动前端
- [x] 补回根级 `dev:admin:remote` 兼容 alias，并同步 README / `scripts/AGENTS.md`
- [x] 跑通本轮针对性验证，并记录结论

## 本轮执行切片（2026-03-23 admin overview 导航补漏）

- [x] 梳理 `Overview` 页内所有内部跳转入口，补齐仍在走原生 `<a href>` 的位置
- [x] 让 `Quick actions` 与 `Open edit view` 走 client-side 导航，避免整页闪动
- [x] 把 `Rebuild` 提升为显眼主操作按钮，同时保留成功/失败状态色
- [x] 补针对性浏览器回归，确认 `Overview` 内跳转不会触发 `beforeunload`

## 本轮执行切片（2026-03-23 duplicate hints 降噪）

- [x] 梳理 `apps/admin` commission duplicate hint 的评分规则与触发条件，确认误报根因
- [x] 收紧 duplicate 判定，只保留“高概率同一条记录”的提示信号
- [x] 调整后台提示文案，避免把相似项误说成 duplicate
- [x] 补针对性测试并验证受影响的 admin 用例

## 本轮执行切片（2026-03-23 CI generated fact-source 测试守门）

- [x] 给 generated fact-source 读取层补充“生成物是否存在”的显式检测入口
- [x] 把依赖真实 generated fact-source 的测试改成懒加载，并在生成物缺失时自动跳过
- [x] 跑通受影响的 Vitest 用例，并确认 CI 报错链路已解除

## 本轮执行切片（2026-03-23 GitHub Actions Node 24 收口）

- [x] 给 CI / Deploy / Rebuild workflow 显式开启 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`
- [x] 验证 workflow YAML 结构正常，并补充本轮结论

## 本轮执行切片（2026-03-23 Astro check Vite 类型错配）

- [x] 修复 `apps/web/astro.config.ts` 里 Tailwind Vite 插件与 Astro 内置 Vite 类型版本错配
- [x] 跑通 `bun run --cwd apps/web check:astro` 与 `bun run --cwd apps/web build:astro`

## 本轮执行切片（2026-03-23 admin 导航减闪动）

- [x] 梳理 `apps/admin` 当前路由切换链路，确认整页闪动根因
- [x] 把 admin 顶部导航改成 client-side history 导航，避免整页 reload
- [x] 给 route 级数据读取加轻量缓存，减少已访问页面回切时的 loading 闪动
- [x] 跑通针对性验证，并把本轮结论补进任务文档

## 北极星目标

- [ ] `apps/web` 继续作为 Astro 静态公开站，部署到 `crystallize.cc`
- [ ] `apps/admin` 成为唯一的 standalone 管理端前端，部署入口为 `admin.crystallize.cc`
- [ ] `apps/admin-worker` 成为唯一的管理端 API / 静态托管 / 认证边界
- [ ] admin `Save` 只写事实源，公开站只在显式 `Publish` 后更新
- [ ] admin 视觉风格严格继承 legacy `/admin/*`，迁移过程始终受 Playwright 基线约束
- [ ] 本地开发最终收敛为一套联合联调链路，而不是三套互相独立的 `dev:*` 命令

## 当前仓库结构真值

- `apps/web`：当前公开站真实运行时，公开构建链只读 `generated/*`；仓库内本地 SQLite/源图已删除，legacy `/admin/*` 代码仅剩未挂载的参考实现
- `apps/admin`：standalone 管理端前端已完成五个主页面迁移，视觉基线已建立，但运行仍依赖 worker API
- `apps/admin-worker`：已有 worker 入口、local-dev CORS、`adminData` 读侧、`adminPersistence` 写侧，以及 character/commission CRUD、alias/suggestion 写入、source-image GET/POST 的 D1/R2 主路径；`source_images` 元数据表、seed/export 增量校验也已接入，生产认证边界改由 Cloudflare Zero Trust 承担
- `packages/domain`：已承接共享类型与纯逻辑，是当前唯一进入主链路的共享包
- `packages/cloudflare`：仅有占位 env 类型，当前未被主链路引用，也尚未承接实际 worker 共享能力
- `packages/ui`：仅有占位导出，尚未吸收 admin/web 的共享 UI
- `packages/config`：仅有 README 占位，尚未承接 tsconfig / lint / build 共享配置

## 当前进度总览

- `已完成` Standalone admin 前端：`overview` / `create` / `edit` / `aliases` / `suggestion` 已全部迁入 `apps/admin`
- `部分完成` Admin worker 读路径：`/api/admin/health`、`/api/admin/bootstrap`、`/api/admin/aliases/bootstrap`、`/api/admin/suggestion` GET、`/api/admin/characters/:id/commissions` GET、`/api/admin/source-image/:fileName` 的 worker-native code path 已具备，且 `wrangler` 已声明 `DB` / `IMAGES` bindings；但 remote preview / production 资源仍未验真
- `部分完成` Admin worker 写路径：CRUD、alias、suggestion、source-image 的 worker-native D1/R2 主路径已齐，`assets/refresh` 已收口为 worker 原生兼容 no-op；当前剩余的是 deployed worker smoke check 与 legacy bridge 进一步缩边
- `部分完成` 远程 D1/R2 实际使用：production D1 migrations `0001` / `0002` 已应用，production R2 source images 已同步，`source_images` 已记录 `commission_file_name/object_key/mime_type/byte_size/sha256`，导出脚本已能按扩展名与 hash 增量复用；但 admin 端到端远程写链路与 deployed worker smoke check 仍未收口
- `已完成` Public web 事实源解耦：`apps/web` 渲染/构建链已改为消费 `apps/admin-worker/scripts/exportWebFactSource.ts` 生成的 `generated/*`，公开站 build 不再读取本地 SQLite 与 `data/images/*`
- `当前主攻` 云端事实源与 Publish：build-input contract 已落地，下一步主线转为 publish-status、锁与恢复策略，以及 deployed worker / admin 远端 smoke check
- `部分完成` 部署、认证、本地联调：域名路由、独立 `dev:web` / `dev:admin` / `dev:worker` 已有，仓库根保留 `deploy:web` / `deploy:admin` 作为手工入口，真实 Worker 配置只存在于 `apps/web/wrangler.jsonc` 与 `apps/admin-worker/wrangler.jsonc`；worker 内置密码已删除，生产认证边界改由 Cloudflare Zero Trust 承担；但尚无统一联调命令、完整 bindings/runbook，也还没在 Dashboard 上验真 push build/deploy

## 阶段状态

### 阶段 0：基础设施与基线

- [x] Astro 运行时迁入 `apps/web`
- [x] 建立 `apps/admin`、`apps/admin-worker`、`packages/domain`、`packages/ui`、`packages/cloudflare`、`packages/config`
- [x] 根脚本覆盖 `dev`、`build`、`lint`、`check`、`test`、`test:visual`
- [x] 根级 `vitest.config.ts` / `playwright.config.ts` 落地
- [x] committed Playwright 基线统一放在根 `test/visual/apps/*`
- [x] legacy admin 基线已覆盖 `overview` / `create` / `edit` / `aliases` / `suggestion`

### 阶段 1：standalone admin 页面对齐

- [x] standalone admin shell 已落地
- [x] `overview` / `create` / `edit` / `aliases` / `suggestion` 已迁入 `apps/admin`
- [ ] 现有顶层样式契约虽已迁入，但 standalone 设计与 legacy `/admin/*` 仍未完全 1:1 对齐
- [ ] legacy 已使用 shadcn/Radix `Select` / dropdown 的位置必须按原控件形态与交互复刻；当前 `AddCharacterForm`、`CommissionFormFields` 仍存在原生 `<select>` 漂移
- [ ] route 级视觉回归仍需覆盖真正的 standalone 对齐，而不只是保留 legacy 参考基线；`overview` 也需要 standalone visual coverage
- [ ] 仍缺独立 smoke test，当前 admin 自动化仍以视觉回归为主

### 阶段 2：admin worker 能力补齐

- [x] worker 入口、路由分发、local-dev CORS 已落地
- [x] worker 已原生持有 `health` 与一组 binding-aware D1/R2 读路径
- [x] worker 已原生持有 CRUD 路由契约：命中、入参归一化、错误响应壳
- [x] `assets/refresh` 已从 legacy passthrough 收口为 worker 原生兼容 no-op
- [x] `apps/admin-worker/wrangler.jsonc` 已声明 `DB` / `IMAGES` bindings，并接入 D1 migration 目录与本地 bootstrap 脚手架
- [x] commission CRUD 已由 worker-native D1 persistence 接管，不再依赖 legacy backend
- [x] alias batch 写入与 suggestion 保存由 worker persistence 接管；已知 admin 写路由缺 binding 时直接失败
- [x] `source-image POST` 已由 worker-native R2 写路径接管
- [x] 写路径测试矩阵已覆盖 alias/suggestion/character/commission/source-image 的 worker-native 路径与缺 binding 报错语义

### 阶段 3：公开站事实源解耦

- [x] `packages/domain` 已承接一部分类型与纯逻辑
- [x] `apps/web` 的 build input contract 已定稿首版：覆盖 `generated/fact-source/content.json`、`generated/fact-source/source-images-manifest.json`、`generated/source-images/*`
- [x] `apps/admin-worker/scripts/exportWebFactSource.ts` 已可把远端 D1/R2 结果导出到 `apps/web/generated/*`
- [x] `apps/web/data/sqlite.ts` 已退出公开站 build 主路径，并从 `apps/web/data` 删除
- [x] `apps/web/data/commissionRecords.ts`、`creatorAliases.ts`、`characterAliases.ts`、`keywordAliases.ts`、`homeFeaturedSearchKeywords.ts` 已改为只读 generated fact-source content
- [x] `apps/web/src/lib/images/sourceImageRegistry.ts` 已改为只读 generated source-images manifest 与 `/generated/source-images/*`
- [x] `apps/web/src/lib/home/buildSitePayload.ts`、`apps/web/src/pages/search/*.ts`、`apps/web/src/pages/rss.xml.ts` 已通过下游 data module 间接消费 generated inputs
- [x] 已证明 `bun run build:web` 在不依赖本地 `apps/web/data/commissions.db` / `apps/web/data/images/*` 的情况下可通过

### 阶段 4：D1 / R2 / Publish 模型

- [x] 已生成 D1 migration SQL baseline（`apps/admin-worker/migrations/0001_admin_fact_source.sql`）
- [x] 已新增 `apps/admin-worker/migrations/0002_source_image_metadata.sql`，把源图扩展名/hash/大小元数据纳入 D1 `source_images`
- [x] 已定义当前 R2 object key 规则：沿用 source image 原文件名作为 object key
- [x] 已完成最后一次 SQLite -> D1、`data/images/*` -> R2 的迁移，并删除仓库内本地 bootstrap/check/sync 脚本与数据副本
- [x] 远端导出已支持按 `commission_file_name + object_key + byte_size + sha256` 增量复用生成图，不匹配时才重新下载并回写 D1 元数据
- [ ] 尚未建立 `dirty` / `publishing` / `published` / `failed` 状态流
- [ ] 尚未建立 publish 锁、重试与失败恢复机制

### 阶段 5：部署、认证、联调

- [x] `apps/web/wrangler.jsonc` 与 `apps/admin-worker/wrangler.jsonc` 已有域名路由骨架
- [x] `apps/admin-worker/src/index.ts` 已收口为无内置密码的静态托管/API 入口，并保留本地同源/CORS 处理
- [x] 根脚本已有 `dev:web` / `dev:admin` / `dev:worker`
- [x] 根脚本已补齐独立 deploy 入口：`bun run deploy:web` / `bun run deploy:admin`
- [x] 两个 Worker 现在各自持有唯一的 app-local `wrangler.jsonc`，手工部署统一走 `bun run deploy:web` / `bun run deploy:admin`
- [x] Cloudflare Workers Builds 已明确收口为“同一 repo 连接两个 Worker，Dashboard root directory 分别指向 `apps/web` / `apps/admin-worker`”
- [ ] D1 / R2 secrets、preview / production 差异与 remote 验证 runbook 仍未文档化；`apps/admin-worker/wrangler.jsonc` 已声明 bindings，但远程资源切换策略仍待定稿
- [ ] 尚无一条命令同时拉起 `apps/web` + `apps/admin` + `apps/admin-worker`
- [ ] `apps/admin` 当前 Playwright 仍通过 `ADMIN_API_BASE_URL=http://127.0.0.1:4173` 访问 legacy dev server，而不是 worker dev
- [ ] Cloudflare Zero Trust 的 production gate 仍需在 Dashboard 手工配置并做一次真实访问验真

### 阶段 6：遗留实现清理与收尾

- [ ] `apps/web/src/devAdmin/pages/*` 仍保留为未挂载参考代码
- [ ] `apps/web/server/devAdminAstro.ts` 仍保留为未接线参考代码
- [ ] `apps/web/server/adminApiHandler.ts` 仍是 legacy admin 真正写入执行者
- [ ] `apps/web/src/features/admin/*` 与 `apps/admin/src/*` 仍双实现并存
- [ ] README / AGENTS / runbook 尚未在 cutover 前后统一收口

## 当前遗留耦合

- [x] `apps/web/server/devAdminAstro.ts`：已从 `astro.config.ts` 断开，不再把 legacy `/admin/*` 注入 Astro dev
- [ ] `apps/web/server/adminApiHandler.ts`：仍保留为 legacy admin 写路径参考代码，但不再是默认运行链
- [ ] `apps/web/src/lib/admin/db.ts`：仍保留为 legacy 本地写路径参考代码，但仓库内本地 SQLite 已删除
- [ ] `apps/web/src/features/admin/imageUpload.ts`：仍保留为 legacy 本地图片写路径参考代码，但仓库内本地图源图已删除
- [x] `apps/web/data/sqlite.ts`：已删除
- [x] `apps/web/src/lib/images/sourceImageRegistry.ts`：已切到 generated source images
- [ ] `apps/web/src/devAdmin/pages/*`：继续保留 legacy admin 页面壳
- [ ] `apps/web/src/features/admin/*` 与 `apps/admin/src/*`：继续双实现并存，存在重复维护风险

## 当前主要风险 / 阻塞

- [ ] build-input hard cutover 已完成，但 publish state / current pointer 仍未建立；现在还不能把“远端事实源”直接等同于“对外发布闭环”
- [ ] `home-character-batches` / `home-timeline-batches` 的图片 payload 依赖 `getImage()`；因此最终 batch JSON 仍不能在 D1/R2 导出脚本里预生成，必须继续由 Astro build 基于 generated source images 推导
- [ ] `source_images` 元数据已经让导出变成增量，但这套 hash/扩展名契约必须持续由 worker 写路径、seed 脚本和导出脚本共同维护，不能再次漂移
- [ ] standalone admin 虽已完成页面迁移，但只要 `apps/web/src/features/admin/*` 和 legacy `/admin/*` 继续存在，就仍有双实现漂移风险
- [ ] standalone admin 当前已经出现“页面迁入完成但控件/设计未完全复刻”的信号；如果不把 shadcn/ui 与 legacy 交互细节列为硬性验收，视觉漂移会继续扩大
- [x] `assets/refresh` 已明确为 worker 兼容性 no-op；后续不得再次误用成“发布按钮”

## 下一步关口

1. 定义 publish bundle / current pointer / `Save` vs `Publish`，把“构建吃什么”与“哪一版对外生效”真正闭环起来
2. 给 deployed worker 与 standalone admin 补远端 smoke check，证明远端写入后的读取、构建、图片访问都能闭环
3. 收口 remote runbook、单命令联调，以及 preview / production 资源切换规则
4. 继续清理 `apps/web` legacy admin 与双实现组件
5. 回头收口 standalone admin 的视觉/交互 1:1 对齐

## 当前执行切片（2026-03-18 web build 远端事实源切换）

- [x] 梳理 `apps/web` 当前对本地 SQLite / `data/images/*` 的依赖链，明确底层入口文件与上层消费链
- [x] 定稿推荐主线为 `D1/R2 -> generated build inputs -> apps/web build`，而不是在页面层直接查 D1 / 直接读 R2 URL
- [x] 把这条主线的详细流程、边界、约束与验收写入 `tasks/roadmap.md` 与 `tasks/todo.md`
- [x] 定义 `content.json` 与 `source-images-manifest.json` 的精确字段契约，并沉淀到 `packages/domain/src/factSource.ts`
- [x] 新增远端导出脚本，把 D1/R2 结果落到 `apps/web/generated/*`
- [x] 让 `apps/web/data/*` 与 `sourceImageRegistry.ts` 切到 generated inputs
- [x] 直接拔掉本地 `apps/web/data/commissions.db` / `apps/web/data/images/*` 的 build 依赖并跑通 `bun run build:web`

## Review（2026-03-18 web build 远端事实源切换）

- [x] 已明确写出公开站当前真正卡住的位置是 `apps/web` 的 build input，而不是 admin worker 再多补几个 D1/R2 route
- [x] 已把 build-input contract 与 publish contract 拆成两层，避免再把“构建吃什么”和“哪一版对外生效”混成一个 snapshot 概念
- [x] 已明确记录：最终 batch JSON 与 RSS/search route 仍应由 Astro build 推导，不能在远端导出脚本里提前伪造
- [x] 已按用户约束收口为硬切换方案：不保留 local adapter、不保留本地数据过渡窗口，直接拔掉公开站的本地数据入口
- [x] `bun run --cwd packages/domain typecheck` 通过。
- [x] `bun run --cwd apps/admin-worker web:fact-source:export --output-root ./.wrangler/tmp/web-fact-source-export` 通过，产出 `12 characters / 16 creator aliases / 3 character aliases / 8 keyword aliases / 6 featured keywords / 123 source images / 0 missing`。
- [x] `bun run lint` 通过。

## 本轮执行切片（2026-03-18 D1 源图元数据增量导出）

- [x] 在 D1 新增 `source_images` 元数据表迁移，存储 `commission_file_name`、`object_key`、`mime_type`、`byte_size`、`sha256`
- [x] 让 worker 的 source-image 创建/替换路径在写 R2 后同步回写 D1 元数据
- [x] 让 `buildD1SeedSql.mjs` 把本地 bootstrap 图片的扩展名/hash/大小写进 seed SQL
- [x] 让 `exportWebFactSource.ts` 优先使用 D1 元数据判断本地 generated 图片是否可复用，不匹配时才重新下载并补写元数据
- [x] 跑通类型检查、测试、lint、双次导出、`check` 与 `build`

## Review（2026-03-18 D1 源图元数据增量导出）

- [x] `bun run --cwd apps/admin-worker typecheck` 通过。
- [x] `bunx vitest run -c vitest.config.ts apps/admin-worker/src/adminApi.test.ts` 通过（30 tests）。
- [x] `bun run lint` 通过。
- [x] 连续两次 `bun run web:fact-source:export` 都得到 `materializedImages=123 | downloadedImages=0 | reusedImages=123 | metadataUpserts=0 | missingImages=0`。
- [x] `bun run test` 通过（51 files / 184 tests）。
- [x] `bun run check` 通过（0 errors / 0 warnings）。
- [x] `bun run build` 通过。

## 本轮执行切片（2026-03-18 删除本地数据源）

- [x] 删除仓库内 `apps/web/data/commissions.db`
- [x] 删除仓库内 `apps/web/data/images/*`
- [x] 删除依赖本地 SQLite/源图的 bootstrap/check/sync 脚本入口与对应根脚本
- [x] 断开 `apps/web` 的 legacy dev admin 注入，避免本地开发继续命中本地数据入口
- [x] 删除以本地 SQLite/图片目录为前提的测试与测试工具
- [x] 跑通本轮删源后的 lint/test/check/build

## Review（2026-03-18 删除本地数据源）

- [x] `bun run lint` 通过。
- [x] `bun run test` 通过（44 files / 172 tests）。
- [x] `bun run build:admin` 通过。
- [x] `bun run check` 通过（0 errors / 0 warnings）。
- [x] `bun run build` 通过。
- [x] `bun run build` / `bun run check` 均在仓库内已无 `apps/web/data/commissions.db` 与 `apps/web/data/images/*` 的前提下完成。

## 本轮执行切片（2026-03-17 文档）

- [x] 在 README、AGENTS、apps/admin-worker/AGENTS 以及任务文档里同步记录 Admin 以 worker + D1/R2 为主、legacy 仅作回滚/bridge 的转换导向。
- [x] 在 `tasks/todo.md` 末尾新增本轮切片列表，确保有可勾选项来追踪这轮文档更新的完成状态。
- [x] 在 `tasks/lessons.md` 追加本轮用户纠偏经验，总结这次迁移记录需要明确标注 worker code path 与 legacy binding 状态的差异。

## 本轮执行切片（2026-03-17 admin dev 收口）

- [x] 把根脚本 `bun run dev:admin` 切到 `apps/admin` + 本地 `wrangler dev`（remote bindings） 的统一入口。
- [x] 移除 standalone admin worker 对 legacy `/api/admin/*` 的运行时 fallback；已知 admin 路由在缺 `DB` / `IMAGES` bindings 时直接失败。
- [x] 更新 worker contract tests，把“fallback 成功”改成“缺 binding 明确报错”。
- [x] 更新 README、AGENTS、`apps/admin/AGENTS.md`、`apps/admin-worker/AGENTS.md`，明确 `dev:admin` 与远程 D1/R2 是唯一默认主线。
- [x] 跑通本轮针对性验证并把结果补到 Review。

## Review（2026-03-17 admin dev 收口）

- [x] `bun run dev:admin` 已改为默认拉起 standalone admin + remote worker。
- [x] worker 已删除 `LEGACY_ADMIN_API_BASE_URL` 运行时依赖与对应 fallback 路径。
- [x] bootstrap / suggestion / source-image / CRUD 写路径在缺 binding 时会返回 503，而不是静默回落到 `apps/web`。
- [x] 任务文档已记录这次“远程 D1/R2 唯一路径”的切换方向。
- [x] `bun run dev:admin` 已切出 `wrangler dev --remote`，改为本地 `wrangler dev` + `remote: true` bindings，并确认 `GET /api/admin/health`、`/bootstrap`、`/aliases/bootstrap`、`/suggestion` 可正常返回。
- [x] 已通过 HTTP `POST /api/admin/characters` + 远程 D1 读回 + HTTP `DELETE /api/admin/characters/:id` 完成一次真实远程写入闭环验证。
- [x] `apps/admin-worker` 的 local-only bootstrap/check/sync 脚本入口已删除，`.wrangler/state` 本地持久态已清除。
- [x] 已验证：`bunx vitest run -c vitest.config.ts apps/admin-worker/src/adminApi.test.ts`、`bun run --cwd apps/admin-worker typecheck`、`bun run --cwd apps/admin typecheck`、`bun run build:admin`、`bun run lint`。

## 本轮执行切片（2026-03-18 本地联调地址对齐）

- [x] 把 standalone admin 在本机环境下回跳公开站的地址统一为 `http://localhost:4321`，避免 `localhost` / `127.0.0.1` 混用造成的 origin 漂移。
- [x] 把 legacy admin API dev server 默认起始端口收口回 `8787`，与当前 standalone admin / worker 联调约定保持一致。
- [x] 跑通本轮针对性验证并把结果补到 Review。

## Review（2026-03-18 本地联调地址对齐）

- [x] `bun run lint` 通过。
- [x] `bun run build:admin` 通过。
- [x] `bun run build` 通过。

## 本轮执行切片（2026-03-18 Cloudflare Builds 脚本收口）

- [x] 把根级长期维护脚本 `scripts/devAdminRemote.mjs` 改成 `scripts/devAdminRemote.ts`
- [x] 给仓库根补齐 `build:web:cf` / `deploy:web:cf` / `build:admin:cf` / `deploy:admin:cf`
- [x] 给仓库根补齐手动独立上线入口 `deploy:web` / `deploy:admin`
- [x] 把 Cloudflare Workers Builds 不读取 `wrangler` custom build、需在 Dashboard 单独配置命令 的真值写入 roadmap/todo/AGENTS
- [x] 跑通本轮针对性验证并把结果补到 Review

## Review（2026-03-18 Cloudflare Builds 脚本收口）

- [x] `bun run lint` 通过。
- [x] `bun run build:admin` 通过。
- [x] `bun run build` 通过。

## 本轮执行切片（2026-03-23 事实源同步并发提速）

- [x] 确认 `web:fact-source:export` 与 `fact-source:sync-images` 的串行瓶颈是否都在 R2 下载链路
- [x] 给图片下载改成有上限的并发执行，避免单文件串行导致 3min 级等待
- [x] 保持缺图、下载失败、metadata upsert 的既有语义不变
- [x] 跑通本轮针对性验证并把结果补到 Review

## Review（2026-03-23 事实源同步并发提速）

- [x] `bun run --cwd apps/admin-worker typecheck` 通过。
- [x] `bun run --cwd apps/admin-worker ./scripts/exportWebFactSource.ts --help` 通过。
- [x] `FACT_SOURCE_WRANGLER_CONFIG=../web/wrangler.jsonc FACT_SOURCE_DOWNLOAD_CONCURRENCY=4 bun run --cwd apps/admin-worker ./scripts/exportWebFactSource.ts --output-root /tmp/ci-export-smoke` 通过，日志确认图片下载以 `concurrency=4` 并发执行，最终 `materializedImages=124 | downloadedImages=124 | missingImages=0`。
- [x] `bun run --cwd apps/web fact-source:sync-images` 当前仍会在缺少 `apps/web/generated/fact-source/source-images-manifest.json` 时快速失败；该失败语义未被本轮修改破坏。

## 本轮执行切片（2026-03-23 monorepo 依赖收口）

- [x] 审计根包与各 workspace 的直接工具依赖缺口
- [x] 修正根级 lint/tooling 依赖声明，解决 `better-tailwindcss` 等包在根上下文不可解析的问题
- [x] 修正 workspace 自己脚本直接依赖但未声明的工具包
- [x] 跑安装与校验，并补一份新开发机依赖安装说明

## Review（2026-03-23 monorepo 依赖收口）

- [x] `bun install` 通过，并更新 lockfile。
- [x] `node -e "console.log(require.resolve('tailwindcss/package.json')); console.log(require.resolve('prettier/package.json'))"` 通过，确认根级工具依赖可从 root workspace 正常解析。
- [x] `bunx eslint apps/admin-worker/scripts/exportWebFactSource.ts apps/admin-worker/scripts/syncMissingSourceImages.ts` 通过，确认 `better-tailwindcss` 不再因根上下文缺依赖而炸掉。
- [x] `bun run --cwd packages/domain typecheck` 通过，确认 `packages/domain` 的 workspace 自身工具依赖声明完整。
- [x] `bun run lint` 通过。

## 本轮执行切片（2026-03-18 admin 认证边界改为 Zero Trust）

- [x] 删除 `apps/admin-worker/src/index.ts` 内置 Basic Auth 校验
- [x] 删除 `apps/admin-worker/wrangler.jsonc` 里的 `ADMIN_REALM`
- [x] 把 admin 生产认证边界改写为 Cloudflare Zero Trust，并同步到 AGENTS / roadmap / todo
- [x] 在 `tasks/lessons.md` 记录这次“不要把本可由平台承担的认证继续塞进 worker”的用户纠偏
- [x] 跑通本轮针对性验证并把结果补到 Review

## Review（2026-03-18 admin 认证边界改为 Zero Trust）

- [x] `bun run lint` 通过。
- [x] `bun run build:admin` 通过。

## 本轮执行切片（2026-03-18 wrangler custom build 收口）

- [x] 把 web/admin 的 build command 直接写进各自 `wrangler.jsonc`
- [x] 把 repo-root deploy command 以 JSONC 注释写进两个 `wrangler.jsonc`
- [x] 删除脚本层重复前置 build，避免 `wrangler deploy` 双重构建
- [x] 用 `wrangler deploy --dry-run` 验证两条 wrangler 调用链

## Review（2026-03-18 wrangler custom build 收口）

- [x] `bun run lint` 通过。
- [x] `bunx wrangler deploy --config apps/web/wrangler.jsonc --dry-run` 通过。
- [x] `bunx wrangler deploy --config apps/admin-worker/wrangler.jsonc --dry-run` 通过。

## 本轮执行切片（2026-03-18 Cloudflare web build 修复）

- [x] 定位 `apps/admin-worker/scripts/exportWebFactSource.ts` 在 Cloudflare Builds 里经 `bunx wrangler` 执行 `d1 execute --command` 时会把整段 SQL 误拆成参数
- [x] 把导出脚本改为优先直接调用本地 `node_modules/.bin/wrangler`，缺失时再回退到 `wrangler`
- [x] 用本地导出、repo-root build、`apps/web` cwd fallback build、以及 `wrangler deploy --dry-run` 复核 web 构建链

## Review（2026-03-18 Cloudflare web build 修复）

- [x] `bun run --cwd apps/admin-worker web:fact-source:export` 通过，结果为 `materializedImages=123 | downloadedImages=0 | reusedImages=123 | metadataUpserts=0 | missingImages=0`。
- [x] `bun run build:web:cf` 通过。
- [x] 在 `apps/web` 目录下执行 `bun run build:web:cf || bun run --cwd ../.. build:web:cf` 通过。
- [x] `bunx wrangler deploy --config apps/web/wrangler.jsonc --dry-run` 通过。

## 本轮执行切片（2026-03-18 monorepo Wrangler 入口收口）

- [x] 删除仓库根 `wrangler.jsonc`，避免 repo-root 自动发现把两个 Worker 混成一个入口
- [x] 把 `apps/web/wrangler.jsonc` 收口到 workspace-local `bun run build`
- [x] 给 `apps/admin-worker/package.json` 新增 `build:assets`，并让 `apps/admin-worker/wrangler.jsonc` 只调用这个本地脚本
- [x] 更新 README、AGENTS、`apps/web/AGENTS.md`、`apps/admin-worker/AGENTS.md`，明确 Cloudflare Workers Builds 必须按 `apps/web` / `apps/admin-worker` 两个 root directory 接同一 repo
- [x] 用针对性命令复核新的本地 deploy/build 链路

## Review（2026-03-18 monorepo Wrangler 入口收口）

- [x] `bun run --cwd apps/web deploy -- --dry-run` 通过；命中 workspace-local `wrangler 4.74.0`，custom build 为 `bun run build`，并成功完成 fact-source 导出与 Astro static build。
- [x] `bun run --cwd apps/admin-worker build:assets` 通过；成功构建 `apps/admin/dist`。
- [x] `bun run --cwd apps/admin-worker deploy -- --dry-run` 通过；命中 workspace-local `wrangler 4.74.0`，custom build 为 `bun run build:assets`，并正确识别 `DB` / `IMAGES` / `ASSETS` bindings。
- [x] 额外确认：直接执行全局 `wrangler 4.22.0` 会对 `remote: true` bindings 给旧 schema 警告，因此仓库约定必须继续通过 workspace 脚本而不是全局 CLI 触发 deploy。

## 本轮执行切片（2026-03-18 web build 绑定上下文收口）

- [x] 确认 `apps/web` 构建链当前通过 `apps/admin-worker/scripts/exportWebFactSource.ts` 拉取远端事实源
- [x] 让导出脚本支持显式指定 `FACT_SOURCE_WRANGLER_CONFIG`，避免继续隐式依赖 admin-worker 默认 config
- [x] 给 `apps/web/wrangler.jsonc` 补齐只读 `DB` / `IMAGES` bindings，使 web Worker 项目本身持有构建时所需的远端资源上下文
- [x] 更新 README、AGENTS、`apps/web/AGENTS.md`、`apps/admin-worker/AGENTS.md`，明确 web build 的绑定来源
- [x] 用 web 侧脚本与 dry-run 验证新的拉数链路

## Review（2026-03-18 web build 绑定上下文收口）

- [x] `bun run --cwd apps/web fact-source:export` 通过；命令行明确显示 `FACT_SOURCE_WRANGLER_CONFIG=../web/wrangler.jsonc`，并成功导出远端事实源到 `apps/web/generated`。
- [x] `bun run --cwd apps/web deploy -- --dry-run` 通过；custom build 链路继续可用，且 dry-run 已显示 web Worker 持有 `env.DB` 与 `env.IMAGES` 两个远端绑定。
- [x] `bun run --cwd apps/admin-worker typecheck` 通过；`exportWebFactSource.ts` 的新路径解析与环境变量收口未引入类型错误。

## 本轮执行切片（2026-03-23 Turborepo 最小接入）

- [x] 评估当前 monorepo 复杂度，确认先引入轻量任务编排而不是直接上 Nx
- [x] 在仓库根新增最小 `turbo.json`，只接管 `build` / `check` / `typecheck` 与可选 `dev` 元数据
- [x] 把根脚本 `build:web` / `build:admin` / `check` / `typecheck` 收口到 `turbo run`
- [x] 给 GitHub Actions 增加 `.turbo/` 缓存，并在 deploy 前预热 Turbo 构建链
- [x] 更新 README / AGENTS / todo，记录当前 Turbo 边界与 CI 使用方式

## Review（2026-03-23 Turborepo 最小接入）

- [x] `bun install` 通过，并更新 lockfile 以纳入 `turbo`。
- [x] `bun run build:admin` 通过；确认 root `turbo run build --filter=@commission-index/admin` 能正常驱动现有 Vite 构建。
- [x] `bun run typecheck` 通过；确认 Turbo 图可执行当前 workspace `typecheck` 任务。
- [ ] `bun run build:web` 未在本地复跑；该链路仍依赖远端 D1/R2 导出权限，应在 CI 或已配置 Cloudflare 凭证的环境中验证。

## 本轮执行切片（2026-03-23 标准 CI 验证流）

- [x] 梳理现有 GitHub Actions，确认 deploy/rebuild 之外缺少标准 push/PR 验证 workflow
- [x] 新增 `.github/workflows/ci.yml`，把基础验证收口为 `lint` / `test` / `typecheck` / `build:admin`
- [x] 把依赖 Cloudflare 密钥的 web 远端验证拆成独立 job，仅在凭证存在时执行
- [x] 给 `apps/web/package.json` 新增 `check:astro` / `build:astro`，避免 CI 在已导出 generated inputs 的前提下重复导出
- [x] 更新 README / AGENTS / todo，记录新的 CI 分层与凭证约束

## Review（2026-03-23 标准 CI 验证流）

- [x] `git diff --check` 通过。
- [x] `bun run lint` 通过。
- [x] `bun run test` 通过。
- [x] `bun run typecheck` 通过。
- [x] `bun run build:admin` 通过。
- [ ] `.github/workflows/ci.yml` 的 `Web Remote Validate` job 未在本地实跑；它依赖 GitHub Actions secrets 与 Cloudflare 远端资源，应在 Actions 环境验真。

## 本轮执行切片（2026-03-23 deploy/rebuild 流程去重）

- [x] 审计 `deploy.yml` / `rebuild.yml`，确认 `web:fact-source:export`、`build:web`、`build:admin` 与 `wrangler deploy` custom build 存在重复执行
- [x] 删除 deploy/rebuild workflow 里的重复 pre-build / pre-export 步骤
- [x] 删除 deploy/rebuild workflow 中对 `.turbo/` 的无效缓存恢复，保留 `apps/web/generated/source-images` 缓存
- [x] 更新 README / AGENTS / todo，记录 deploy/rebuild 现以 workspace-local Wrangler custom build 为唯一构建真值

## Review（2026-03-23 deploy/rebuild 流程去重）

- [x] `git diff --check` 通过。
- [x] 已人工复核：`apps/web/wrangler.jsonc` 的 build command 仍为 `bun run build`，`apps/admin-worker/wrangler.jsonc` 的 build command 仍为 `bun run build:assets`，workflow 删除 pre-build 后不会失去构建步骤。
- [ ] deploy/rebuild workflow 未在 GitHub Actions 上实跑；需要等待下一次 Actions 执行验证 wrangler deploy 路径。

## 本轮执行切片（2026-03-23 Actions cache 观测）

- [x] 给 `ci.yml` 的主要验证步骤补 `duration_seconds` 输出
- [x] 给 `ci.yml` 的 Turbo / source-images cache 补 `cache-hit` 可见性
- [x] 给 `deploy.yml` / `rebuild.yml` 补 step summary，记录 install、deploy 耗时与 source-images cache 命中
- [x] 更新 README / AGENTS / todo，明确当前 cache 决策应先看 Actions summary 数据

## Review（2026-03-23 Actions cache 观测）

- [x] `git diff --check` 通过。
- [x] 已人工复核三个 workflow：每个 summary step 都使用 `if: always()`，前置步骤失败时仍会尽量输出观测信息。
- [ ] 新增 `GITHUB_STEP_SUMMARY` 观测尚未在 Actions 环境实看；需要等下一轮 CI / deploy / rebuild 运行后读取 summary 数据。

## 本轮执行切片（2026-03-23 Turbo/CI 缺陷修复）

- [x] 给 `apps/web` 新增 workspace-local `typecheck`，避免 root Turbo `typecheck` 静默跳过 web
- [x] 把 `ci.yml` 的 `push` 触发收口到 `master`，减少同仓 PR 分支的重复验证
- [x] 把 Cloudflare 密钥检测提到独立 job，避免无 secrets 场景白跑 `bun install`
- [x] 让 `validate` job 恢复 `apps/web/generated` 并在可用时运行 cached `astro check`
- [x] 把 deploy/rebuild 缓存从 `source-images` 扩到整个 `apps/web/generated`，让后续 CI 能复用完整 web 构建输入
- [x] 更新 README / AGENTS / todo，记录新的 CI/缓存真值

## Review（2026-03-23 Turbo/CI 缺陷修复）

- [x] `git diff --check` 通过。
- [x] `bun run --cwd apps/web typecheck` 通过。
- [x] `bun run typecheck` 通过，确认 root Turbo 现在会实际执行 web workspace 的 `typecheck`。
- [ ] 新的 `actions/cache/restore` / `actions/cache/save` 路径与 cached `astro check` 尚未在 GitHub Actions 环境验真；需要等下一轮 CI / deploy / rebuild 执行结果。

## Review（2026-03-25 本地 Turbo Astro 构建缓存拆链）

- [x] `bun x turbo run build --filter=@commission-index/web --dry=json` 已确认只有 `@commission-index/web` 会依赖 `fact-source:export`，未误伤其他 workspace。
- [x] 连跑两次 `bun run build:web`：第一次 `fact-source:export` / `build` 双 miss，第二次 `Cached: 2 cached, 2 total`。
- [x] `bun run check` 通过，确认拆链后 `astro check` 仍会先复用 `fact-source:export`。

## Review（2026-03-25 web typecheck 配置减脂）

- [x] `apps/web/tsconfig.typecheck.json` 已删除，`apps/web/package.json` 的 `typecheck` 已直接改为 `tsc --noEmit -p tsconfig.json`。
- [x] `bun run typecheck` 通过，确认 root Turbo 仍会覆盖 `@commission-index/web`，且 web workspace 已直接使用主 `tsconfig.json` 完成类型检查。
- [x] 本轮未调整 `wrangler.jsonc` 所有权与 deploy 入口，保持 workspace-local deploy 边界不变。

## Review（2026-03-25 Want this 跨视图状态同步）

- [x] 根因分两层：一是同一条 commission 在 Character / Date 两个视图里各有一颗按钮；二是 Character 视图按钮常常在 deferred load 之后才插入 DOM，旧逻辑既不会同步现有同键按钮，也不会自动 hydrate 新插入的按钮。
- [x] `apps/web/src/features/home/commission/unpublishedInterestClient.ts` 已改为：写入 localStorage 后同步刷新页面内所有同键按钮，并通过 `MutationObserver` 自动 hydrate 后续 deferred append 的 `Want this` 按钮。
- [x] `bun vitest run apps/web/src/features/home/commission/unpublishedInterestClient.test.ts` 通过，并已覆盖“同键双按钮同步”和“记录后延迟插入按钮自动显示 Recorded”两条回归路径。
- [x] `bun eslint apps/web/src/features/home/commission/unpublishedInterestClient.ts apps/web/src/features/home/commission/unpublishedInterestClient.test.ts tasks/todo.md` 通过。

## 本轮执行切片（2026-03-26 SurpriseMe React 弃用类型清理）

- [x] 定位 `apps/web/src/features/home/search/SurpriseMe.tsx` 中 `React.MutableRefObject` 弃用告警来源
- [x] 将 `pickAvoidingLast` 改为依赖最小化的结构化 ref 类型，避免继续引用弃用 React 类型名
- [x] 运行针对性检查，确认 Astro/TypeScript 不再报告该 warning

## Review（2026-03-26 SurpriseMe React 弃用类型清理）

- [x] `bun run check` 通过，`apps/web` 诊断结果为 `0 errors / 0 warnings / 0 hints`，原 `MutableRefObject` warning 已消失。
- [x] `bun eslint apps/web/src/features/home/search/SurpriseMe.tsx` 初次执行暴露仓库规则 `ts/consistent-type-definitions`；已将本轮新增的 `type CurrentRef<T>` 收口为 `interface CurrentRef<T>`，避免引入新的 lint 噪音。

## Review（2026-04-09 CLAUDE.md -> AGENTS.md 迁移）

- [x] 仓库内 13 处分层 `CLAUDE.md` 均已新增同目录 `AGENTS.md`，未触碰 `node_modules` 等外部目录。
- [x] 新增的 `AGENTS.md` 已去除对 `Claude Code` / `claude.ai/code` / “root `CLAUDE.md`” 的真值依赖，`rg --glob 'AGENTS.md'` 检查无残留旧指向。
- [x] 原 `CLAUDE.md` 已统一收口为兼容跳板，继续读取旧文件名的工具会被导向同目录 `AGENTS.md`。
- [ ] 本轮未运行 lint/test；迁移仅涉及 agent 文档与任务记录，不影响运行时代码路径。
