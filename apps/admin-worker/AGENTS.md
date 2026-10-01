# admin-worker

Standalone admin Cloudflare Worker: API router, D1/R2 CRUD, asset serving.

## Key Files

- `src/index.ts` — worker entrypoint (CORS, asset serving, API delegation)
- `src/adminApi.ts` — route matching, payload normalization, error envelopes, D1/R2 execution
- `src/adminData.ts` — read-side loader (bootstrap, aliases, suggestion, source-image GET by commission ID)
- `src/adminPersistence.ts` — D1 write helpers (character/commission/alias/suggestion CRUD)
- `src/adminSourceImages.ts` — R2 source-image validation and write helpers
- `src/adminApi.test.ts` — contract tests locking CRUD normalization and failure responses
- `src/exportWebFactSource.test.ts` — 只读导出、SQLite 快照、revision、不可变对象与本地路径映射测试
- `scripts/exportWebFactSource.ts` — 只读 D1/R2 -> `apps/web/generated/*`，输出带稳定 `meta.revision` 的 content/manifest
- `migrations/` — versioned D1 schema and commission identity backfills

## Responsibilities

- Serve `admin.crystallize.cc` with Cloudflare Zero Trust as auth boundary
- Own all admin CRUD on D1/R2
- Fail fast when `DB` or `IMAGES` bindings are missing
- Keep `exportWebFactSource.ts` config-driven so `apps/web` builds use web-owned bindings

## Commission Identity API

- Create and PATCH accept explicit `commissionDate` (`YYYY-MM-DD`) and `creatorName` (string
  or `null`); callers do not submit the legacy `fileName`.
- Every commission has an immutable opaque `publicId`; numeric `id` remains the internal D1 and
  source-image relationship key. Create/PATCH accept `workGroupId` and `partNumber` together,
  or both `null` for standalone works. The `new` sentinel creates a group. Part records remain
  independent commissions with independent image references.
- Source-image GET and replacement address `/api/admin/commissions/:id/source-image`; image
  references follow the stable commission ID.
- Changing date or creator only updates D1 metadata. It must not rename, copy, move, overwrite,
  or delete the R2 object. A replacement is a separate explicit operation.
- `docs/api-reference.md` and `docs/ai-agent-guide.md` define the public contract. Keep them
  synchronized with route, serialization, and error behavior in the same change.

## Migration `0004_commission_identity`

- Adds nullable `commissions.commission_date` and `creator_name`, then backfills them from the
  legacy filename; adds nullable `source_images.commission_id` and maps rows by the existing
  filename relationship; adds the ID/date and ordering indexes; drops only the redundant
  explicit object-key index (the `UNIQUE` constraint remains).
- This migration keeps legacy columns and does not move or delete R2 objects. Before applying,
  verify the exact D1 migration history and schema, malformed filename/date rows, image metadata
  with no matching commission, duplicate image mappings, and the expected indexes. The date
  substring backfill is not calendar validation; unresolved rows require explicit handling.
- Do not run all pending historical migrations against populated D1 without checking each one.
  In particular, if `0003_rename_stale_to_archived` is pending on a populated database, stop:
  rebuilding `characters` can cascade-delete `commissions` despite a successful migration.
- An interrupted or unexpected migration stops the run. Capture actual schema, counts, stable
  ID sets, relationships, migration history, and R2 key/hash state before deciding whether to
  resume or repair; never blindly replay an ambiguous step.

### Migration Commands

From `apps/admin-worker`, Wrangler 4.142.0 exposes:

```sh
../../node_modules/.bin/wrangler d1 migrations list commission-index-admin-data --config ./wrangler.jsonc --remote
../../node_modules/.bin/wrangler d1 migrations apply commission-index-admin-data --config ./wrangler.jsonc --remote
```

`list` reports unapplied migration files; it is not a substitute for inspecting the actual D1
schema and applied migration table. `apply` runs every pending migration, not only `0004`, and
must not be used until all earlier migrations and the target schema are explicitly reconciled.
The workspace shortcut `pnpm -C apps/admin-worker run d1:migrate` is remote too. Wrangler's
post-apply backup is an additional D1 safeguard, not a verified local backup and not an R2
object backup. Non-interactive execution skips the confirmation prompt, so automation must
enforce its own preflight and approval gates. Do not invoke either remote command as part of
local validation.

### Migration `0005_public_commission_identity_and_parts`

- Adds a random immutable UUID `public_id` to each commission, a UUID-keyed `commission_groups`
  table, and paired nullable `work_group_id`/positive `part_number` fields with uniqueness and
  integrity triggers. Existing 141 rows remain independent; only the 12 verified `(part 1/2)`
  rows in six reviewed pairs are grouped. Creator names lose only their explicit part suffix.
- The insert trigger fills `public_id` when an older Worker version writes during rollout; existing
  part fields survive legacy updates. Deploy the new Worker before enabling the new Admin form.
- This migration does not modify source-image metadata, R2 keys, or object bytes. Validate exact
  commission and image counts, unique/non-null UUIDs, six two-part groups, foreign keys, and
  exported schema-v3 snapshot before Web deployment.

### Rollback Boundary

- Before new-model writes are enabled, the retained legacy columns allow an application/read
  path rollback while leaving the additive schema in place. If the database itself must return
  to its pre-migration state, restore the backup into an isolated database and switch only after
  validation. Keeping added columns is safer than ad-hoc schema reversal. Recreate the explicit
  index only if the approved old schema requires it.
- Once new writes are accepted, prefer forward repair. New date/creator combinations may not
  encode uniquely in the old `fileName` format; restoring a pre-migration D1 snapshot would lose
  post-snapshot edits. Do not restore it without a complete replayable change journal.
- D1 restore does not restore R2 bytes. Preserve old immutable objects throughout the rollback
  window; R2 and D1 do not share a transaction. Do not treat a Worker rollback, D1 Time Travel,
  or metadata restoration as a complete system rollback by itself.

## API Documentation

Before modifying any route or data shape, read:

- `docs/api-reference.md` — endpoint contracts (the ground truth for external callers)
- `docs/ai-agent-guide.md` — implicit behaviors (serialization, normalization, R2 lifecycle)

**Keep both docs in sync** whenever you add/remove endpoints, change field names or types, or alter implicit behaviors (error codes, normalization rules, R2 cleanup logic). Update them in the same commit as the code change.

## Guardrails

- API/persistence tests use `test/sqliteD1.ts`: in-memory SQLite with the ordered migrations,
  atomic D1-style batches, optional failure injection, and per-test connection cleanup.
  Assert stored results and rollback invariants instead of SQL spelling; keep R2 mocked.
- Do not reintroduce worker-side auth (Zero Trust owns it)
- Do not mix public site routes into this worker
- CORS allowances limited to local dev origins; production is same-origin
- Keep `source_images` D1 metadata aligned with R2 objects for incremental export reuse
- 普通导出不修复或回写 D1 metadata；单个 SELECT 读取结构化快照，图片下载需匹配快照 hash/size
- R2 key 为不可变对象身份，本地文件仍以作品文件名为 stem；manifest `objectKey` 与 `relativePath` 各司其职
- 两份 JSON 共用稳定 revision，保留独立 exportedAt；发布只导出一次，后续构建校验并复用该快照
