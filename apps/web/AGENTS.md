# web

Active Astro 7 public runtime (`crystallize.cc`).

## Key Files

- `astro.config.ts` — Astro config + dev integrations
- `wrangler.jsonc` — public-site Worker config; must retain read-only `DB`/`IMAGES` bindings for build-time fact-source export
- `src/config/` — site metadata
- `server/` — Astro dev integrations, admin API handler bridge
- `data/` — schema-v2 generated fact-source loader and snapshot contract validation
- `src/lib/rssItem.ts` — RSS item projection from stable ID and explicit date/creator fields
- `generated/` — gitignored build inputs from remote D1/R2 (fact-source JSON + source images)

## Responsibilities

- Render static output from Astro; no runtime D1/R2 access
- Treat `generated/*` as the only fact source — no SQLite or `data/images/*` reads
- Fact-source schema v2 gives every commission a stable `id`, nullable ISO `commissionDate`, and nullable `creatorName`; these fields drive display, search, ordering, timeline, RSS, and update summaries
- `fileName` is retained only as the local source-image mapping key; never parse it for public commission metadata or use it as a record/search identity
- `seriesKey`/`seriesOrder` are optional export compatibility metadata for historical preview/part groups; aggregation selects the descending `seriesOrder` winner to retain the old filename ordering, while new commissions without the keys remain independent
- The exporter alone may derive `seriesKey` for legacy formatted filenames; Web aggregation consumes only that explicit key and must not parse `fileName`. Keep preview/part merge counts stable for RSS and update summaries
- Generated content and image manifest must use schema v2 and the same revision; reject stale or malformed generated inputs at the read boundary
- Admin lives in `apps/admin` + `apps/admin-worker` — not in this app

## Dependency Boundaries

- May import from `packages/*` only — never from `apps/admin` or `apps/admin-worker`
- Remote D1/R2 access belongs to `exportWebFactSource.ts`; web only consumes the generated snapshot
- Web-owned builds drive export through `apps/web/wrangler.jsonc`, not admin-worker's config
