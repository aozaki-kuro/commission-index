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
- Locale list lives in `src/config/locales.ts` (`WEB_LOCALES`); to add a language, extend it and add `src/pages/<locale>/index.astro` (astro i18n and both home locale tables derive from it).

## Astro 7

- Keep `i18n.routing.redirectToDefaultLocale` explicit
- Keep `src/content.config.ts` present even when empty (suppresses dev warning)
- Do not enable CSP (Shiki inline styles conflict; analytics needs `https://sight.crystallize.cc`)

## Home Page Architecture (Astro-first)

Static markup is Astro templates. All client-side behavior uses Astro script components
(`HomeClientScript.astro`) and vanilla TS modules.

- **Deferred sections:** active/stale character sections and timeline use an inline manifest + external
  batch JSON, lazy-loaded by script loaders
- **Content-hashed batch filenames:** each batch file is named `<index>.<hash>.json`
  (`/search/home-character-batches/<locale>/<status>/0.k3j9x.json`, timeline alike); the search index is
  `/search/home-search-entries.<hash>.json`. The hash is djb2 (`lib/utils/hash.ts`) over the **final
  serialized payload**, so editing one commission — or a localized message, or an alias — changes only the
  affected bytes' filename. The manifest's `batchVersions` and the batch endpoint's path come from one
  memoized builder (`features/home/server/homeCharacterBatchArtifacts.ts`, `homeTimelineBatchArtifacts.ts`),
  and the manifest's `v` is the search-index version (`lib/pipeline/homeSearchEntries.ts`); they cannot
  disagree. Batches and search entries are served `Cache-Control: immutable`, so unchanged data costs zero
  requests.
- **Stale-HTML manifest fallback:** the inline manifest in cached HTML can name a hashed file a deploy
  deleted. On a hash-navigation miss, or on a batch/search-entries `404`, loaders fetch
  `/search/home-character-manifest/<locale>.json` or `/search/home-timeline-manifest/<locale>.json`
  (`Cache-Control: no-cache`) with cache-busting and retry once against the fresh `targetBatchById` /
  `batchVersions` / `v`. Only fetched on the fallback path.
- **DOM contracts:** `data-*` attributes drive search/nav/hash navigation — preserve attribute names.
  `data-stale-visibility` = stale group expanded; `data-stale-loaded` = deferred stale sections mounted.
- Character/stale section templates must mount with the full entry list intact (no per-section entry lazy
  mounts above anchor targets)
- **Soft navigation lifecycle:** `<ClientRouter />` never fires `pagehide` and runs bundled module scripts once.
  Client islands mount via `bindSoftNavMount` (`@lib/astro/softNavMount`) on `astro:page-load` and dispose on
  `astro:before-swap`; never mount from top-level module code
- **Age gate first frame:** an inline head script in `HomePage.astro` sets `html[data-age-gate-initial=open]` (and `data-age-gate-open`) before paint when `warning/ageGate.ts` says the gate must show; CSS in `AgeGateScript.astro` renders it opaque with no animation. `mountAgeGate` removes the attribute and suppresses the entrance animation inline until the next state change. ClientRouter's `swapRootAttributes` resets `<html>` attributes from the server HTML on every swap, so the attribute cannot go stale
- **Re-hydration on append:** batch DOM appended after first mount must re-hydrate / re-bind interactive
  controls — a single first-paint hydrate pass is not enough
- **Hidden DOM + observers:** sections rendered with `display: none` must not be marked "entered viewport"
  by reveal/lazy observers; toggling visibility must re-scan
- **Scroll stability:** never lazy-load content above an anchor target on the navigation path — browser
  scroll restoration and lazy injection fight each other. Verify scroll position after expand/inject, not
  just visibility
- **Search index freshness:** the search rebuild snapshot key must include the batch mount count, not just
  a `visible/loaded` boolean — otherwise newly injected DOM briefly shows unfiltered

Update this section when manifest fields, batch/search hash inputs, the hashed filename builders,
`_headers` cache policy for the search JSON / HTML, or deferred endpoints change.

## Search UX

- Search UI must be layout-stable on first paint — no shell-to-content swaps
- Production search index: `/search/home-search-entries.<v>.json` (not DOM metadata), `v` from the character manifest
- Search locale labels resolve from `homeSearchControls.ts` (not the full `homeLocale` graph)
- Matcher rules (CJK/kana vs JS `\b`) live in the root `AGENTS.md`

## Production `/admin` verification

The public deployment is static-only. `/admin` and `/api/admin/*` must return 404 via
`assets.not_found_handling = "404-page"` (`public/_redirects` holds only public redirects). After
deploy, all of these must be `404` (`vite preview` does not reproduce edge status behavior):

```bash
curl -I https://<your-domain>/admin
curl -I https://<your-domain>/admin/aliases
curl -I https://<your-domain>/api/admin/bootstrap
```
