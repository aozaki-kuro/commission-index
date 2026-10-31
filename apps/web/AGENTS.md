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
- Public output must not carry commit SHAs, repo URLs or the GitHub owner name. The repo is public, and GitHub commit search resolves a SHA or prefix to it. `/build-info.json` therefore always has `codeSha: null` (`createPublicBuildInfo`).

## Astro 7

- Keep `i18n.routing.redirectToDefaultLocale` explicit
- Keep `src/content.config.ts` present even when empty (suppresses dev warning)
- Do not enable CSP (Shiki inline styles conflict; analytics needs `https://sight.crystallize.cc`)

## Home Page Architecture (Astro-first)

Static markup is Astro templates. All client-side behavior uses Astro script components
(`HomeClientScript.astro`) and vanilla TS modules.

- **Static listing:** every character and timeline section is server-rendered; there is no deferred batch, manifest
  or section fetch. Archived sections sit in `[data-archived-sections-container]` (`hidden` until shown).
  `commission/archivedCharactersToggle.ts` owns show/collapse (class `hidden` on the container, divider and
  placeholder, `data-archived-visibility` on the character panel, the state-change event and the session
  persistence pair; state and events in `commission/archivedCharactersState.ts`) and answers show requests
  synchronously, so callers subscribe before requesting and can scroll in the same frame. It reads the panel
  attribute on mount: the inline script in `StaticCommissionSections.astro` already expanded archived before paint
  when the hash (character view) targets an archived entry. `homeHashTarget.ts` owns the URL hash (on
  load, on `hashchange` and on a re-click of the current hash): it resolves it via `getHashTarget`, expands archived
  when needed and scrolls; sidebar and hamburger resolve their own clicks through the same helpers. Entry ids are
  `<sectionId>-commission-<publicId>` and the same id appears in both the character and timeline panels;
  `getHashTarget` (`lib/navigation/hashAnchor.ts`) picks the copy in the active panel, so never resolve with a
  bare `getElementById`. Search treats entries inside the collapsed container as hidden matches (the "load
  archived" notice), not visible ones.
- **Search index file:** `/search/home-search-entries.<hash>.json` is the only hashed artifact. The hash is djb2
  (`lib/utils/hash.ts`) over the final serialized payload, so editing one commission, a localized message or an
  alias changes only the affected filename. Its version `v` is built once by `lib/pipeline/homeSearchEntries.ts`,
  rendered onto the root `data-search-index-version` and served at `/search/home-search-version.json`
  (`Cache-Control: no-cache`); they cannot disagree. The entries file is served `Cache-Control: immutable`.
- **DOM contracts:** `data-*` attributes drive search/nav/hash navigation — preserve attribute names.
  `data-archived-visibility` (on the character panel) = archived group expanded.
- **Soft navigation lifecycle:** `<ClientRouter />` never fires `pagehide` and runs bundled module scripts once.
  Client islands mount via `bindSoftNavMount` (`@lib/astro/softNavMount`) on `astro:page-load` and dispose on
  `astro:before-swap`; never mount from top-level module code
- **Image fade-in:** `commission/imageFadeIn.ts` (mounted in `criticalMounts`) fades `[data-commission-image] > img` in on `load`. Fail open: CSS hides images only under `html[data-image-fade=on]`, which the mount sets after marking already-`complete` images `data-loaded`, so no-JS and cached reloads never flash. The LCP image (`priority`) is server-rendered with `data-loaded`: Chrome ignores `opacity: 0` paints for LCP. `load`/`error` do not bubble, so the listeners are document-level capture; `error` also marks loaded so a broken image never stays invisible. Dispose leaves the attribute; ClientRouter resets `<html>` attributes on swap and the next mount sets it again
- **Floating buttons auto-hide:** below `lg` the hamburger and language roots get `data-floating-hidden` (one controller, `nav/hamburger/floatingButtonsAutoHide.ts`, mounted from `homePageClient.ts`) while scrolling down; never hidden near the top/bottom, while a menu is open, keyboard focus is inside, or the age gate is open. CSS-only hide (no `aria-hidden`/`inert`).
- **Scroll depth analytics:** `scroll_depth_reached` (5/10/25/50/75/100, `commission/scrollDepthTracker.ts`) measures
  reached entries against each view panel's server-rendered `data-total-entries` — active characters only for the
  character view (archived stays out), every entry for the timeline. Keep that count equal to what the panel
  renders statically. Silent while `?q=` filters the list. `reached_by` turns `jump` for the rest of the mount once
  a nav character link, shuffle (`markScrollJump`) or a deep-linked hash moved the reader; a new jump path must call
  `markScrollJump` too.
- **Analytics events are decision-driven:** `@lib/analytics/events.ts` keeps only events a pending question or a
  standing signal reads (depth funnel, first-screen actions, nav jumps that inflate depth, `age_gate`
  `shown`/`confirmed`, unpublished interest). Drop an event once its question is answered instead of keeping it
  "just in case". `age_gate` has no `left` action: the leave button navigates away immediately, so the event would
  be lost; derive it as `shown − confirmed`.
- **Analytics properties are filter dimensions:** Rybbit's event list only counts events and breaks each property
  down on its own; per-session counts with exact property filters come from Goals and Funnels. So properties stay
  low-cardinality and shared: home events use `view_mode` and `layout` (`desktop`/`mobile` at `lg`); never add
  counts, ids or names that change with content (`total_entries`, `character_name` were removed for fragmenting
  breakdowns). Read depth as one Goal per milestone (`scroll_depth_reached`, `depth`=5…100, `view_mode=character`,
  plus `reached_by=scroll` for data from 2026-11-01). Do not chain milestones in a Funnel: its steps need a strictly
  later server-arrival `timestamp_ms`, and milestones crossed in one scroll update are sent together, so later steps
  undercount. Renaming an event or changing a property's values breaks comparison with older data; adding or removing
  a property does not.
- **Search entry points:** `search_used.source` is `input`, `keyword` (featured row or browse popover) or
  `url_query`. Before 2026-11-01 it was always `url_query` (the model never got the real source), so older values
  are meaningless. `popular_keyword_clicked.from` is `row` (featured chips) or `all` (browse popover), added
  2026-11-01. Typed search was ~0.5% of sessions over Aug–Oct 2026, versus ~2.4% for keyword chips; invest in click
  entry points, not query syntax.
- **Unpublished interest:** the "want this" button keys its localStorage flag and `i_want_to_see_it { commission }`
  on `commission.publicId`; admin joins vote counts on that id (`GET /api/admin/interest`). Never key it on
  character name or date — same-day works collided and renames orphaned the votes.
- **Age gate first frame:** an inline head script in `HomePage.astro` sets `html[data-age-gate-initial=open]` (and `data-age-gate-open`) before paint when `warning/ageGate.ts` says the gate must show; CSS in `AgeGateScript.astro` renders it opaque with no animation. `mountAgeGate` removes the attribute and suppresses the entrance animation inline until the next state change. ClientRouter's `swapRootAttributes` resets `<html>` attributes from the server HTML on every swap, so the attribute cannot go stale
- **Age gate persistence is best-effort:** unreadable or unwritable `localStorage` shows the gate on every full load (the inline head script and the module agree). A confirmation that cannot be persisted is remembered in memory via the `window[CONFIRMED_IN_MEMORY_FLAG]` flag (`warning/ageGate.ts`), which survives ClientRouter soft navigations (language switches) and resets on a full load. ClientRouter does not re-run an identical inline head script on swap, and the flag keeps the first frame closed even if it did
- **Hidden DOM + observers:** sections rendered with `display: none` must not be marked "entered viewport"
  by reveal/lazy observers; toggling visibility must re-scan
- **Scroll stability:** never lazy-load content above an anchor target on the navigation path — browser
  scroll restoration and lazy injection fight each other. Verify scroll position after expand/inject, not
  just visibility
- **Search index freshness:** the search rebuild snapshot key must include the search mode and the archived
  visibility, so toggling archived never leaves a stale index or briefly shows unfiltered entries

Update this section when search hash inputs, the hashed filename builder, `_headers` cache policy for the search
JSON / HTML, or the archived toggle / hash navigation contract change.

## Search UX

- Search UI must be layout-stable on first paint — no shell-to-content swaps
- Production search index: `/search/home-search-entries.<v>.json` (not DOM metadata), `v` from the root `data-search-index-version` attribute (`#--------Commissions--------`); a 404 retries once with `v` from `/search/home-search-version.json` (`no-cache`); no unversioned index route exists
- Search locale labels resolve from `homeSearchControls.ts` (not the full `homeLocale` graph)
- `?q=` mirrors the applied query: written via `replaceState(history.state, …)` ~300 ms after it is applied (never `pushState`; `null` state would wipe ClientRouter's), removed on clear; a self-write fires no location-change event; a `popstate` that changes `?q=` makes the address win over typed text, a hash-only one keeps it
- Link-click interceptors (sidebar, hamburger, hash) must bail on `!isUnmodifiedPrimaryClick(event)` (`lib/navigation/hashAnchor.ts`) so modified/middle clicks open normally
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
