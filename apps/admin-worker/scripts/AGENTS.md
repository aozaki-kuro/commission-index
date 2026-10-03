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

## 源图 key 迁移（工具已移除）

把 `source_images.object_key` 从根目录旧 key 和作品目录 key 迁到扁平 `source-images/<sha256>-<UUIDv4>.jpg|png` 的一次性 CLI 已完成使命，并从仓库移除。它当时复用 exporter 的配置/桶环境变量、要求桶等于配置的 `IMAGES.bucket_name`，先复制并回读校验全部字节，再做带条件的 D1 更新并逐行回读完整计划，全程不删除任何 R2 对象或 D1 行。

- 副本、校验和与回滚命令见 `.backups/r2-flat-key-migration-20261003/archived-tool/`（不入库）；恢复步骤见同目录 `RESTORE.md` 与 `../r2-key-migration-20261003/RESTORE.md`。
- 两个计划仍保留：v2 恢复作品目录，v1 再恢复原始根 key。2026-10-03 已按用户授权删除 287 个旧对象，R2 仅剩 141 个当前扁平对象；恢复旧映射前必须先从本地字节备份重新上传对应对象并校验，不能直接运行回滚 SQL。
- 以后清理对象仍须读取真实桶库存与最新 D1 引用，逐项确认待删对象未被引用，且备份与保留期允许删除。
- 若将来需要再次迁移，应从归档副本恢复该工具并重新走完整的备份、dry-run、校验流程，不要临时手写 SQL 直接改 D1。

## syncMissingSourceImages.ts

只读 manifest、不查 D1 的图片补齐脚本。下载用 `objectKey`（R2 身份），本地校验与落盘用 `generated/<relativePath>`，与导出器写入的路径一致；不能把 `objectKey` 拼成本地路径。
