# admin-worker/scripts

## exportWebFactSource.ts

只读导出远端 D1/R2 到 `apps/web/generated/*`，不回写 D1。单个 SELECT 获取全部结构化数据；本地图片匹配 D1 hash/size 时可复用，下载不匹配则拒绝提交新快照。

- Target remote D1/R2 directly — no local SQLite/image bootstrap path
- `apps/web/generated/*` is disposable build input, not committed source
- R2 `objectKey` 可为带目录的不可变 key；本地路径始终为 `source-images/<commissionFileName>.<ext>`，复用与清理使用 canonical 本地文件名
- Preserve `source_images` metadata contract: `commission_file_name`, `object_key`, `mime_type`, `byte_size`, `sha256`
- content/manifest 的 `meta.revision` 对业务数据和图片哈希计算，排除 `exportedAt`；两份文件必须对应同一 revision
- `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1` 只校验快照和图片字节；若提供 `WEB_BUILD_CACHE_TOKEN`，必须等于快照 revision。此路径不调用 Wrangler
- 导出模块可安全导入；CLI 入口使用 main guard。对应测试位于 `../src/exportWebFactSource.test.ts`
