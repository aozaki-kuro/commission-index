# admin-worker/scripts

## exportWebFactSource.ts

- Read-only export of remote D1/R2 to `apps/web/generated/*` (disposable build input); never writes back to D1. One D1 SELECT snapshot; local images are reused only if hash/size match it, and a mismatched download aborts the snapshot.
- Every commission must have a `source_images` row. A missing row is a hard error (lists the commission names); never guess an R2 key from the file name.
- `objectKey` is the opaque R2 identity; `relativePath` (`source-images/<commissionFileName>.<ext>`) is the local path. Never derive one from the other.
- content and manifest share `meta.revision` (excludes `exportedAt`). `exportedAt` is captured immediately before the D1 snapshot read whose result is exported (re-sampled before the not-found retry re-read), not after R2 image export, so consumers can safely reject snapshots whose reads began before a publish request.
- On R2 not-found the exporter re-reads the D1 snapshot once and retries (closes the replace-image
  window: D1 commits before the old object is deleted); a hash/size mismatch is not that race and
  aborts immediately. Still aborts after one retry.
- `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1` only validates the snapshot and image bytes, makes no Wrangler call, and requires `WEB_BUILD_CACHE_TOKEN` (if set) to equal the snapshot revision.
- Importing the module is side-effect free; the CLI runs behind a main guard. Tests: `../src/exportWebFactSource.test.ts`.

## listR2Orphans.ts

Offline inventory: lists R2 objects under `source-images/` via the Cloudflare REST API (Wrangler cannot list
R2), diffs against D1 `source_images.object_key`, and reports unreferenced keys. Requires
`CLOUDFLARE_API_TOKEN` (R2 read, plus write for `--delete`) and `CLOUDFLARE_ACCOUNT_ID`. Dry-run by default;
deletion only with `--delete`. Run: `pnpm -C apps/admin-worker run r2:list-orphans`.

## syncMissingSourceImages.ts

Reads the manifest only (no D1). Downloads by `objectKey`, validates and writes at `generated/<relativePath>`.

## writeOfflineFactSource.ts

Writes the committed fictional fixture (`webVisualFixture.ts`, no image files; every commission is listed under the
manifest's `missing`) as a `databaseBinding: fixture` snapshot for the web visual server. `FACT_SOURCE_DIR` (absolute,
or relative to `apps/web`) picks the target, `<dir>/fact-source`; the web loader reads the same variable. Unset, it
writes `apps/web/generated/fact-source` and refuses to overwrite a non-fixture snapshot. CI runs it with
`working-directory: apps/admin-worker` and `FACT_SOURCE_DIR=generated-fixture`, then `check:astro` reads the same dir.
