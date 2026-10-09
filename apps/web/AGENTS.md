# web

Active Astro 7 public runtime (`crystallize.cc`). Workspace, deploy and CI rules live in the root `AGENTS.md`;
product context is `PRODUCT.md`.

## Rules

- Static output only. `generated/*` is the only fact source; never read SQLite or `data/images/*`.
- Fact-source schema v3: `publicId` is the identity for anchors, search, RSS and update summaries. Integer `id` is internal only.
- Never parse `fileName` for metadata or identity. Source images resolve only by integer `id` through the generated manifest (exact match); a missing image renders as missing, never a neighbouring file.
- Multi-part works (`workGroupId`/`partNumber`) stay separate; lists, search and RSS keep every numbered non-preview part.
- The exporter derives legacy preview markers from filenames. Web aggregation consumes the explicit `legacySeriesKind`/`seriesOrder` fields and never parses `fileName`.
- Reject stale, duplicate-ID or malformed generated input at the read boundary, not deeper in the pipeline.
- Imports use the `@layouts/*`, `@features/*`, `@lib/*` aliases from `tsconfig.json`. Do not add `#` aliases.
- Search metadata and timeline grouping have one implementation in `@commission-index/domain`; do not re-fork them into web. `buildCommissionSearchMetadata` takes `fileName` only from admin (legacy-key search term); the public site omits it so its search text stays identity-free.
