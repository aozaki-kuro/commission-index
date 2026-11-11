# admin-worker

Standalone admin Cloudflare Worker: API router, D1/R2 CRUD, asset serving. Production auth is Cloudflare Zero Trust; do not add worker-side auth or public-site routes here.

## Key Files

- `src/index.ts` — entrypoint (CORS, asset serving, API delegation)
- `src/adminApi.ts` — routes, payload normalization, error envelopes
- `src/adminInterest.ts` — Rybbit reads (vote counts, outbound link clicks)
- `src/adminData.ts` — read side (bootstrap, aliases, source-image GET)
- `src/adminPersistence.ts` — D1 write helpers
- `src/adminSourceImages.ts` — R2 source-image validation and writes
- `scripts/` — web fact-source export / image sync (see `scripts/AGENTS.md`)
- `migrations/` — ordered D1 schema migrations

## API behavior

- Contract docs: `docs/api-reference.md`, `docs/ai-agent-guide.md` (sync rule lives in root `AGENTS.md`).
- Missing `DB` / `IMAGES` bindings return 503 via `createMissingBindingResponses` in `adminApi.ts`.
- `GET /api/admin/interest` (`adminInterest.ts`) proxies Rybbit vote counts by `commission` publicId; it is matched before any D1/R2 access, needs only the `RYBBIT_API_KEY` secret (503 if missing, 502 on Rybbit failure, single attempt) and must never echo the key. `GET /api/admin/link-clicks` follows the same contract and returns
  raw outbound `{ url, count }` for the calendar year to date (UTC); matching URLs to commissions is admin's job.
- CORS: same-origin, or an `Origin` host of `localhost`, `*.localhost`, or `127.0.0.1` (see `isLocalHostname` in `src/index.ts`).
- Writes are origin-checked in `src/index.ts` (`isForgedWrite`): a non-GET `/api/admin/*` request with an `Origin` other than the worker's own gets 403 (Zero Trust is cookie auth and simple POSTs skip preflight). No `Origin` passes. Local origins pass only with `ALLOW_LOCAL_ORIGINS=1`, injected by the `dev` script's `--var`; never add it to `wrangler.jsonc`. Do not infer "local" from `request.url`: `wrangler dev` reports the route host there.
- The entry also catches anything a handler throws: malformed JSON → 400, other faults → logged 500, both as the JSON envelope with CORS headers.
- Create/PATCH take `commissionDate` + `creatorName`; `workGroupId` and `partNumber` are given together or both `null`, and `workGroupId: "new"` creates a group.
- Commission `links` and a non-empty `design` must be absolute `http(s)` URLs (`validateCommissionFields`); they
  render into public `href`s. `normalizeCommissionMutation` in `adminPersistence.ts` does not re-check URLs.
- Source-image uploads are typed by magic bytes only (JPEG/PNG; MIME and file name ignored) and capped at 10 MiB
  (`MAX_SOURCE_IMAGE_BYTES` in `adminSourceImages.ts`). `request.formData()` buffers the whole body, so upload
  routes first reject a `Content-Length` above the cap plus 1 MiB (`exceedsUploadBodyLimit` in `adminApi.ts`).
- `index.ts` adds `X-Content-Type-Options: nosniff` to every `/api/admin/*` response. Source-image GET serves only
  `image/jpeg`/`image/png` (`getSourceImageMimeType`): a stored R2 content type outside those is ignored in favour
  of the key extension, and an unknown extension is a 500.
- Alias batch saves (`replaceAliasRowsAtomically`) delete every stored row whose normalized key matches the
  submitted one before writing one row, because the tables are keyed by the exact name while reads merge by
  normalized key. Creator keys stay case-sensitive (only `(part N)` is folded).
- D1 allows at most 100 bound parameters per statement (the sqlite test double enforces it); never bind one
  parameter per row of an unbounded list. A `db.batch()` counts as one query toward the per-invocation limit.
- Renaming a character re-homes its `character_aliases` row in the same atomic batch (the table is keyed by the exact
  name); an existing row under the new name is merged, not replaced.
- Editing date/creator only updates D1; it never renames, copies, moves, or deletes R2 objects. Replacing an image is a separate explicit operation.
- `commissionDate` may not be later than today in UTC+14 (`isFutureCommissionDate` in `packages/domain/src/commissionDate.ts`, checked in `adminApi.ts` and `adminPersistence.ts`). The UTC+14 zone is an owner-approved assumption; tighten it in that one helper if needed.
- Source-image GET (`/api/admin/commissions/:id/source-image`) resolves the key from `source_images` (by `commission_id`, falling back to `commission_file_name = c.file_name` for legacy rows). No row means 404; never probe the bucket by filename.
- `DELETE /characters/:id` also deletes that character's commissions and their `source_images` rows; after the D1 batch commits it deletes the character's R2 objects (best effort — a cleanup failure leaves orphans, reclaimed via `r2:list-orphans`). Requires `IMAGES`; treat a cascade as data loss.

## D1 migrations

- Never run `migrations apply` (or `pnpm -C apps/admin-worker run d1:migrate`) blindly against populated remote D1. It applies every pending migration; a pending `0003_rename_stale_to_archived.sql` rebuilds `characters` and can cascade-delete `commissions`.
- `wrangler d1 migrations list` only lists unapplied files. Inspect the real remote schema, applied-migration table, row counts, and ID sets first (database `commission-index-admin-data`, binding `DB`, config `wrangler.jsonc`).
- Remote commands are never part of local validation. Non-interactive runs skip Wrangler's confirmation prompt, so automation needs its own approval gate.
- Read paths assume every migration in `migrations/` is applied and do no per-request schema probes. Apply (after the checks above) before deploying a worker whose reads depend on a new migration; otherwise those endpoints return 500.
- D1 restore does not restore R2 bytes, and the two share no transaction. Once new writes are accepted, prefer forward repair over restoring an old D1 snapshot.

## Tests

- API/persistence tests use `test/sqliteD1.ts` (in-memory SQLite with the ordered migrations, atomic batches, failure injection). Assert stored results and rollback invariants, not SQL text; R2 stays mocked at the boundary.
