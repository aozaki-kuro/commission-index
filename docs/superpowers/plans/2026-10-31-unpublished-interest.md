# Unpublished interest in admin (2026-10-31)

Goal: show the owner, in admin, how many visitors asked to see each unpublished commission, so the ranking can
decide what to publish next.

## Rulings

- Identity is `commission.publicId` (stable D1 column). The old key `${kebabName}-${YYYYMMDD}` collided for
  same-day works of one character and changed on rename or date edits; it is dropped, not migrated. Votes recorded
  under the old key stay in Rybbit as `sub_event` and are not shown.
- Event stays `i_want_to_see_it`; its only property becomes `commission: <publicId>`. Counting starts on
  2026-10-31 (deploy day); older events carry only `sub_event`, so the `commission` key filters them out.
- Counts are Rybbit event counts (`GET /api/sites/3/events/properties?event_name=i_want_to_see_it`), not sessions.
  Each browser can vote once per work (localStorage), which is enough for a ranking.
- The admin worker holds the Rybbit key (`RYBBIT_API_KEY` secret) and proxies one read-only endpoint. A missing key
  is a 503 like `GITHUB_DISPATCH_TOKEN`; Rybbit failures are a 502. The overview card fails on its own, never the
  overview.
- Admin lists works with votes that have no source links (`links` empty), highest count first.

## Steps

1. [x] Web: interest button keys and reports by `publicId` (`IllustratorInfo.astro`, `unpublishedInterestClient.ts`,
       `homePageClient.ts`), tests, `apps/web/AGENTS.md`.
2. [ ] Worker: `GET /api/admin/interest` → `{ since, counts: { [publicId]: number } }`, tests with a mocked Rybbit
       fetch, `docs/api-reference.md`, `docs/ai-agent-guide.md`, `apps/admin-worker/AGENTS.md`.
3. [ ] Admin: overview "Most wanted" card joined with bootstrap rows, admin UI test, visual mock + baselines.
4. [ ] Owner: create a Rybbit API key and run `wrangler secret put RYBBIT_API_KEY` for `commission-index-admin`.
