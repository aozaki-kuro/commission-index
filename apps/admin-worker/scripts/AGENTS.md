# admin-worker/scripts

## exportWebFactSource.ts

- Read-only export of remote D1/R2 to `apps/web/generated/*` (disposable build input); never writes back to D1. One D1 SELECT snapshot; local images are reused only if hash/size match it, and a mismatched download aborts the snapshot.
- Every commission must have a `source_images` row. A missing row is a hard error (lists the commission names); never guess an R2 key from the file name.
- `objectKey` is the opaque R2 identity; `relativePath` (`source-images/<commissionFileName>.<ext>`) is the local path. Never derive one from the other.
- content and manifest share `meta.revision` (excludes `exportedAt`). `exportedAt` is captured immediately before the D1 snapshot read whose result is exported (re-sampled before the not-found retry re-read), not after R2 image export, so consumers can safely reject snapshots whose reads began before a publish request.
- On R2 not-found the exporter re-reads the D1 snapshot once and retries (closes the replace-image
  window: D1 commits before the old object is deleted); a hash/size mismatch is not that race and
  aborts immediately. Still aborts after one retry.
- "Not found" means a non-zero wrangler exit whose output, with the object key and output path removed, contains
  wrangler's not-found wording. Never match a bare `404`: keys and paths carry dates such as `20240421`.
  `syncMissingSourceImages.ts` uses the same rule.
- Manifest `mimeType` comes from the D1 row (extension only as fallback) for downloaded and reused images alike,
  so `meta.revision` never depends on the local cache.
- `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1` only validates the snapshot and image bytes, makes no Wrangler call, and requires `WEB_BUILD_CACHE_TOKEN` (if set) to equal the snapshot revision.
- Importing the module is side-effect free; the CLI runs behind a main guard. Tests: `../src/exportWebFactSource.test.ts`.

## listR2Orphans.ts

Offline inventory: lists R2 objects under `source-images/` via the Cloudflare REST API (Wrangler cannot list
R2), then reads D1 `source_images.object_key` (in that order, so an upload committed in between is referenced),
and reports unreferenced keys. Requires `CLOUDFLARE_API_TOKEN` (R2 read, plus write for `--delete`) and
`CLOUDFLARE_ACCOUNT_ID`. Dry-run by default; `--delete` removes only orphans whose listed `last_modified` is at
least 24 h old (missing/unparseable means kept), and is refused when D1 returns no references. Both payloads are
shape-checked. Decision logic: `planOrphanCleanup` / `parseReferencedObjectKeys`, tested in
`../src/listR2Orphans.test.ts`; the CLI runs behind a main guard. Run: `pnpm -C apps/admin-worker run r2:list-orphans`.

## syncMissingSourceImages.ts

Reads the manifest only (no D1). Downloads by `objectKey`, checks the bytes against the manifest `sha256` /
`byteSize` (a mismatch fails that item and writes nothing), and writes at `generated/<relativePath>`.
`syncSourceImages` is importable (main guard); tests: `../src/syncMissingSourceImages.test.ts`.

## writeOfflineFactSource.ts

Writes the committed fictional fixture (`webVisualFixture.ts`, no image files; every commission is listed under the
manifest's `missing`) as a `databaseBinding: fixture` snapshot for the web visual server. `FACT_SOURCE_DIR` (absolute,
or relative to `apps/web`) picks the target, `<dir>/fact-source`; the web loader reads the same variable. Unset, it
writes `apps/web/generated/fact-source` and refuses to overwrite a non-fixture snapshot. CI runs it with
`working-directory: apps/admin-worker` and `FACT_SOURCE_DIR=generated-fixture`, then `check:astro` reads the same dir.

`FACT_SOURCE_PLACEHOLDER_IMAGES=1` (requires `FACT_SOURCE_DIR`) also writes deterministic placeholder PNGs
(`fixturePlaceholderImages.ts`) into `apps/web/generated/source-images/` and lists them under the manifest's `files`,
so a fixture `astro build` can run; the PR job uses it. The image glob in the web registry ignores `FACT_SOURCE_DIR`,
which is why the placeholders go there, and the writer refuses if that tree holds anything but earlier placeholders.
