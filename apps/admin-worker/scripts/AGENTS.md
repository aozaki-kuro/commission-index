# admin-worker/scripts

## exportWebFactSource.ts

- Read-only export of remote D1/R2 to `apps/web/generated/*` (disposable build input); never writes back to D1. One D1 SELECT snapshot; local images are reused only if hash/size match it, and a mismatched download aborts the snapshot.
- Every commission must have a `source_images` row. A missing row is a hard error (lists the commission names); never guess an R2 key from the file name.
- `objectKey` is the opaque R2 identity; `relativePath` (`source-images/<commissionFileName>.<ext>`) is the local path. Never derive one from the other.
- content and manifest share `meta.revision` (excludes `exportedAt`).
- `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1` only validates the snapshot and image bytes, makes no Wrangler call, and requires `WEB_BUILD_CACHE_TOKEN` (if set) to equal the snapshot revision.
- Importing the module is side-effect free; the CLI runs behind a main guard. Tests: `../src/exportWebFactSource.test.ts`.

## syncMissingSourceImages.ts

Reads the manifest only (no D1). Downloads by `objectKey`, validates and writes at `generated/<relativePath>`.

## writeOfflineFactSource.ts

Writes the empty `databaseBinding: fixture` snapshot for offline web visual tests. Refuses to overwrite a
non-fixture snapshot; mirrors the CI fixture shape in `.github/workflows/ci.yml`.
