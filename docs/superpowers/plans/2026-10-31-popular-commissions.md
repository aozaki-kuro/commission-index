# Popular commissions in admin (2026-10-31)

Goal: an overview leaderboard of the ten most popular commissions over the last year, with link clicks and
"want this" votes side by side.

## Rulings

- Two columns, never summed: link clicks (published works) and votes (unpublished works) are mutually exclusive on
  the site at any moment and differ in unit (repeatable clicks vs one vote per browser), so a sum would drown votes.
  Rank by clicks, then votes, then newest. "Most wanted" stays as the unpublished-only view.
- Clicks come from Rybbit's automatic outbound tracking (`GET /api/sites/3/events/outbound`, top 1000 URLs by
  count), window = the last 365 days in UTC. The worker proxies the raw `{ url, count }` list; admin joins it to
  the bootstrap rows' `links`, like votes. A 2026-10-31 dry run matched 11404 of 14459 clicks (the rest are
  odaibako, YouTube, creator profiles and other non-commission links).
- URL match is case-insensitive after dropping the scheme, `www.`, a trailing `/` and the fragment, with
  `twitter.com` treated as `x.com`; the query string is kept (Hedao `pid`, Nijie `id` identify the work).
- A click on a link that several works share (multi-part works) counts for each of them; a work with several
  links sums them.
- Same failure contract as votes: 503 without `RYBBIT_API_KEY`, 502 on Rybbit failure; the card fails on its own.

## Steps

1. [x] Worker: `GET /api/admin/link-clicks` → `{ since, until, clicks: [{ url, count }] }`, tests, docs.
2. [x] Admin: ranking in `src/lib/popularCommissions.ts`, overview "Popular this year" card, UI test.
