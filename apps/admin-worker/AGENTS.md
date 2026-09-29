# admin-worker

Standalone admin Cloudflare Worker: API router, D1/R2 CRUD, asset serving.

## Key Files

- `src/index.ts` — worker entrypoint (CORS, asset serving, API delegation)
- `src/adminApi.ts` — route matching, payload normalization, error envelopes, D1/R2 execution
- `src/adminData.ts` — read-side loader (bootstrap, aliases, suggestion, source-image GET)
- `src/adminPersistence.ts` — D1 write helpers (character/commission/alias/suggestion CRUD)
- `src/adminSourceImages.ts` — R2 source-image validation and write helpers
- `src/adminApi.test.ts` — contract tests locking CRUD normalization and failure responses
- `src/exportWebFactSource.test.ts` — 只读导出、SQLite 快照、revision、不可变对象与本地路径映射测试
- `scripts/exportWebFactSource.ts` — 只读 D1/R2 -> `apps/web/generated/*`，输出带稳定 `meta.revision` 的 content/manifest
- `migrations/` — D1 schema (characters, commissions, aliases, keywords, source_images)

## Responsibilities

- Serve `admin.crystallize.cc` with Cloudflare Zero Trust as auth boundary
- Own all admin CRUD on D1/R2
- Fail fast when `DB` or `IMAGES` bindings are missing
- Keep `exportWebFactSource.ts` config-driven so `apps/web` builds use web-owned bindings

## API Documentation

Before modifying any route or data shape, read:

- `docs/api-reference.md` — endpoint contracts (the ground truth for external callers)
- `docs/ai-agent-guide.md` — implicit behaviors (serialization, normalization, R2 lifecycle)

**Keep both docs in sync** whenever you add/remove endpoints, change field names or types, or alter implicit behaviors (error codes, normalization rules, R2 cleanup logic). Update them in the same commit as the code change.

## Guardrails

- Do not reintroduce worker-side auth (Zero Trust owns it)
- Do not mix public site routes into this worker
- CORS allowances limited to local dev origins; production is same-origin
- Keep `source_images` D1 metadata aligned with R2 objects for incremental export reuse
- 普通导出不修复或回写 D1 metadata；单个 SELECT 读取结构化快照，图片下载需匹配快照 hash/size
- R2 key 为不可变对象身份，本地文件仍以作品文件名为 stem；manifest `objectKey` 与 `relativePath` 各司其职
- 两份 JSON 共用稳定 revision，保留独立 exportedAt；发布只导出一次，后续构建校验并复用该快照
