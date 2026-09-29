# web

Active Astro 7 public runtime (`crystallize.cc`).

## Key Files

- `astro.config.ts` — Astro config + dev integrations
- `wrangler.jsonc` — public-site Worker config; must retain read-only `DB`/`IMAGES` bindings for build-time fact-source export
- `src/config/` — site metadata
- `server/` — Astro dev integrations, admin API handler bridge
- `data/` — schema-v3 generated fact-source loader and snapshot contract validation
- `src/lib/rssItem.ts` — RSS item projection from stable ID and explicit date/creator fields
- `generated/` — gitignored build inputs from remote D1/R2 (fact-source JSON + source images)

## Responsibilities

- Render static output from Astro; no runtime D1/R2 access
- Treat `generated/*` as the only fact source — no SQLite or `data/images/*` reads
- Fact-source schema v3 gives each commission a stable opaque `publicId`, explicit nullable ISO `commissionDate`, nullable `creatorName`, and paired nullable `workGroupId`/positive `partNumber`; public anchors/search/RSS/update identity use `publicId`, while integer `id` remains internal to image-manifest relationships and ordering
- `fileName` is retained only as the local source-image mapping key; never parse it for public commission metadata or use it as a record/search identity
- `workGroupId`/`partNumber` explicitly represent multi-part works. Each part remains a separate work; preserve all numbered non-preview parts in lists/search/RSS. Legacy preview aggregation uses exporter-only `legacySeriesKind` and `seriesOrder` compatibility metadata
- The exporter alone may derive legacy preview markers from historical filenames; Web aggregation consumes explicit metadata and must not parse `fileName`
- Generated content and image manifest must use schema v3 and the same revision; reject stale, duplicate public IDs, invalid part pairs, or malformed generated inputs at the read boundary
- Admin lives in `apps/admin` + `apps/admin-worker` — not in this app

## Dependency Boundaries

- May import from `packages/*` only — never from `apps/admin` or `apps/admin-worker`
- Remote D1/R2 access belongs to `exportWebFactSource.ts`; web only consumes the generated snapshot
- Web-owned builds drive export through `apps/web/wrangler.jsonc`, not admin-worker's config
