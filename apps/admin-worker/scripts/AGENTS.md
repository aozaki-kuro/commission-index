# admin-worker/scripts

## exportWebFactSource.ts

只读导出远端 D1/R2 到 `apps/web/generated/*`，不回写 D1。单个 SELECT 获取全部结构化数据；本地图片匹配 D1 hash/size 时可复用，下载不匹配则拒绝提交新快照。

- Target remote D1/R2 directly — no local SQLite/image bootstrap path
- `apps/web/generated/*` is disposable build input, not committed source
- 新 R2 `objectKey` 规范为 `source-images/<sha256>-<UUIDv4>.jpg|png`，只含分类前缀；读取按不透明 key 兼容历史根与作品目录布局。本地路径始终为 `source-images/<commissionFileName>.<ext>`，复用与清理使用 canonical 本地文件名
- Preserve `source_images` metadata contract: `commission_file_name`, `object_key`, `mime_type`, `byte_size`, `sha256`
- 每条作品必须有 `source_images` 行；缺失属于数据完整性错误，导出列出作品名后直接抛错，不记入 `missing`，也不按文件名猜测 R2 key
- content/manifest 的 `meta.revision` 对业务数据和图片哈希计算，排除 `exportedAt`；两份文件必须对应同一 revision
- `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1` 只校验快照和图片字节；若提供 `WEB_BUILD_CACHE_TOKEN`，必须等于快照 revision。此路径不调用 Wrangler
- 导出模块可安全导入；CLI 入口使用 main guard。对应测试位于 `../src/exportWebFactSource.test.ts`

## migrateLegacySourceImageKeys.ts

将 `source_images.object_key` 的根目录旧 key 和严格验证的历史作品目录 key 迁移到新上传的扁平 `source-images/<sha256>-<UUIDv4>.jpg|png`。合法扁平 key 跳过；作品目录必须匹配本行 filename/SHA/UUIDv4/扩展名，扁平化时保留完整 basename；根 key 才生成新 UUID。SHA 自相矛盾、未知布局、URL 不安全、扩展/MIME 不一致、目标冲突或交叉 key 重叠均中止，已跳过的行也须通过全量关联/metadata 校验。

从仓库根目录调用 `pnpm exec tsx apps/admin-worker/scripts/migrateLegacySourceImageKeys.ts`；默认 `--dry-run` 只读 D1 并落盘计划。显式 `--execute --plan <path>` 执行迁移，`--rollback --plan <path>` 仅反向条件更新 D1（先只读校验旧对象）。支持 `--binding` 和 `--concurrency 1..8`，并发默认 4；新默认计划位于 `.backups/r2-flat-key-migration-20261003/plan.json`，顶层固定 `schemaVersion: 2` / `targetLayout: 'flat-v1'`。复用 exporter 的配置/桶环境变量，并要求桶与配置的 `IMAGES.bucket_name` 一致。

无版本字段的 v1 计划严格按根 → 作品目录布局校验，只允许 `--rollback`；forward 和 dry-run 复用明确拒绝，未知/混合版本拒绝。v1 回滚不依赖扁平化资格，允许计划外合法扁平行，并以 `.v1-rollback-<UUID>` SQL 前缀保存本次记录，保护第一次 SQL/JSON。新规划排他创建，不覆写旧备份或原计划；同一 v2 计划 partial resume/rollback 保留目标 key。

- 安全不变量：D1 每行始终指向存在且 hash/size 正确的对象；保留旧对象保证在途导出和回滚可用。
- 已有计划复用原 UUID；写前再次读取完整计划，任意 key 或元数据漂移整体中止；导入后逐行验证原始完整计划，`rows_written` 因 UNIQUE 索引写入膨胀，仅作统计。
- 完整 forward/rollback SQL 与本次 pending SQL 分开保存，只在漂移检查通过后写入；先持久化计划再执行任何远端写入。
- `d1 execute --remote --file` 使用 import API，期间 D1 短暂不可查询；操作前冻结 admin 写入并暂停导出。
- 回滚整体校验完整计划；若计划中图片已被后台合法替换，先人工核对计划，不自动跳过该行并回滚其他行。
- 迁移从不删除 R2 对象或 D1 行；保留的根目录和历史作品目录两代源对象都是回滚副本，必须明确关闭回滚窗口后才能独立审批清理，不能按孤儿对象扫描结果直接删除。若需恢复根布局，先回滚 v2 恢复作品目录，再按第一次 v1 计划回滚。
- 可安全导入，CLI 有 main guard；离线测试位于 `../src/migrateLegacySourceImageKeys.test.ts`，不得在本地验证时运行生产迁移。

## syncMissingSourceImages.ts

只读 manifest、不查 D1 的图片补齐脚本。下载用 `objectKey`（R2 身份），本地校验与落盘用 `generated/<relativePath>`，与导出器写入的路径一致；不能把 `objectKey` 拼成本地路径。
