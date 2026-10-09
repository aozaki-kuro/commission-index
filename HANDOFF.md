# HANDOFF（2026-10-09）

分支 `chore/handoff-closeout`（在 master 之上 16 个 commit，均未 push）。本次会话把 Codex 时期遗留的
web 审计工作包（WS1–WS5）与 `open-issues.md` 里的可修事项做掉，并把文档收口到当前代码。

## 进展（按主题）

- **WS1 客户端岛生命周期** `225944b`：新增 `apps/web/src/lib/astro/softNavMount.ts`，搜索岛 / 年龄门 /
  图片提示改走 `astro:page-load`（挂载）+ `astro:before-swap`（清理），搜索岛保留延迟挂载并取消未触发的 idle。
  浏览器实测软导航到 `/ja/` 后建议 8/8/8（修复前 0）。
- **WS2 图片精确映射** `fce98b7`：删 `resolveStemByFallback`，只按 `byCommissionId` 精确解析。
- **WS5 文档与 locale** `0843d1c` + `5810884`：修正 manifest 路径；locale 列表收敛到
  `apps/web/src/config/locales.ts`。
- **Web 性能 / 收敛** `ba32f3b`（聚焦只预取下一批）、`5594868` + `359f7b1`（删 web 内 domain 分叉副本）。
- **Domain** `2a6d471`（补 `search.test.ts`）、`f93db2a`（删死代码 `commissionFileName.ts`）。
- **Admin** `44fae25`（裁剪器动态 import）、`7074abb`（刷新后保留晚到保存结果）、`2909399`（拒绝未来日期）。
- **脚本 / CI / 测试** `2596bfe`（`dev:admin` 检查 4174）、`2d0a753`（`deploy-web-snapshot` 复合动作 + 源图片缓存）、
  `ffcb0a9`（`VISUAL_OFFLINE=1` 离线 web 冒烟 + admin ui spec glob）。
- **WS4/P6 发布反馈** `b3e8f5d`：构建产出 `apps/web/src/pages/build-info.json.ts`（`dataRevision` / `dataExportedAt` /
  `codeSha` / `builtAt`），`_headers` 对该文件 no-cache + admin 源 CORS；worker rebuild 返回 `dispatchedAt`；
  后台 `liveBuildInfo.ts` 的 `isBuildConfirmed` 带 30 s 时钟容差，`websiteRebuild.ts` 轮询约 10 分钟（退避 5→30 s），
  超时报 unconfirmed；侧栏显示 `LiveBuildVersion`。
- **WS3/P5 + 角色删除清 R2**（R2 删除 commit on `chore/handoff-closeout`）：`DELETE /characters/:id` 在 D1 批提交后，
  按 `commission_id` / `commission_file_name` 选出该角色的 R2 object_key，只删无存活行引用的 key（1000 个一批、
  无 `IMAGES` binding 返回 503、R2 失败仅 `console.warn` 仍返回 200）；导出器遇 R2 `not_found` 重读一次 D1 再重试，
  关闭换图在途导出的竞争窗口。
- **离线孤儿清点脚本** `apps/admin-worker/scripts/listR2Orphans.ts` + 脚本 `r2:list-orphans`
  （默认 dry-run，`--delete` 才删，走 Cloudflare REST API）。**尚未对生产运行过。**

## 当前状态

- 每个改动合入后门禁目标为绿：`pnpm run lint`、`pnpm run typecheck`、`pnpm run test`、离线 `astro check`、admin build。
  **最终整轮尚待跑**（owner 审查 PR 前未再全量重跑）。
- 本文件与 `docs/open-issues.md`、`docs/audit-2026-10-05-web-architecture.md` 为纯文档改动；ESLint 忽略 `docs/**`，
  lint 通过不代表文档本身被校验。
- `chore/handoff-closeout` 的内容已全部落地（WS1–WS5 与 R2 删除均在工作树内）。

## 下一步（owner 操作）

代码与文档收口已完成，剩余事项均需 owner 操作或确认：

1. **PERF-02 生产只读核验**（未合并分支 `perf/admin-worker-drop-schema-probes`，commit `e410e3d`）。
   逐条命令（其余不变）：

   ```bash
   node_modules/.bin/wrangler d1 execute commission-index-admin-data --remote --config apps/admin-worker/wrangler.jsonc --command "<SQL>"
   ```

   - `SELECT id, name, applied_at FROM d1_migrations ORDER BY id` → 期望 5 行（0001–0005）。
   - `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name` → 期望 8 张业务表
     `character_aliases, characters, commission_groups, commissions, creator_aliases, home_featured_search_keywords, keyword_aliases, source_images`
     （`sqlite_master` 还会返回 `d1_migrations` 与 `sqlite_sequence`，共 10 行）。
   - `SELECT name FROM pragma_table_info('commissions')` → 期望 13 列
     `id, character_id, file_name, links, design, description, hidden, keyword, commission_date, creator_name, public_id, work_group_id, part_number`。
   - `SELECT name FROM sqlite_master WHERE type='trigger'` → 期望 7 个触发器
     `commission_groups_require_uuid_insert, commission_groups_immutable_id, commissions_validate_public_id_insert, commissions_assign_public_id_after_insert, commissions_require_public_id_update, commissions_validate_work_parts_insert, commissions_validate_work_parts_update`。

   - `SELECT status, count(*) AS n FROM characters GROUP BY status` → 只应有 `active` / `archived`。
   - `SELECT count(*) AS total, sum(public_id IS NULL) AS missing_public_id FROM commissions` → `missing_public_id` 应为 0。
   - `SELECT count(*) FROM source_images WHERE commission_id IS NULL` → **必须为 0**，否则不能删除 R2 旧文件名回退探测。

2. **确认 UTC+14 假设**：未来日期一律拒绝（owner 已定），但实现用 UTC+14 比较，属实现者假设；现有未来日期行在任何
   PATCH 前都会失败。
3. **branch protection（P11）**：在 GitHub 设置里为 master 开启 required checks（仓库内无法核验）。
4. **审查并合并 PR**（`chore/handoff-closeout` → master）。
5. **孤儿脚本首次运行**：dry-run 返回后先挑一个 key 人工核对，再考虑 `--delete`；agent 不得运行该脚本。

## 已知风险

- `perf/admin-worker-drop-schema-probes` 在 owner 完成上面第 1 步前**不得合并**。
- 跨标签刷新仍会重拉每个已加载角色（仅相关角色未失效），见 `open-issues.md`。
- web 内别名逻辑与 domain 同名文件仍重复（当前仅注释语言不同）。
- Playwright 仍单视口，`VISUAL_OFFLINE` 只能测启动；移动端/视口/可访问性/性能基线未验收。
- R2 故障注入与真实运行时并发未验证（需 Cloudflare 运行时）。
- CI 复合动作与源图片缓存只能在真实 Actions 运行中验证。
