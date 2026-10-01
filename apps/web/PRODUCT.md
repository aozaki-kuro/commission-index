# Commission Index

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is adult readers browsing and discovering artwork from the owner's personal
commission collection. They may arrive to find a particular character, illustrator, date, or keyword,
or explore unfamiliar works. The owner confirmed that reader discovery is the public site's priority.

Illustrators and readers can also contact the owner through the published contact links. Collection
maintenance belongs to the separate private admin, not this public application.

## Product Purpose

Make a personal collection of commissioned illustrations easy to browse, find again, and follow.
Readers view previews, inspect associated metadata, and follow available source links to the original
posts. RSS lets returning readers follow collection updates.

Success means finding relevant works, reaching their original posts, and returning to a shared or
previously visited entry without losing browsing context. The site does not provide transactions or
original-image distribution. This purpose and audience were confirmed during initialization.

## Positioning

A personal commission archive curated by the person commissioning the artwork. The owner is not
presented as the illustrator. The collection connects previews with characters, explicit delivery
metadata, illustrator attribution, search vocabulary, and original-platform links when available.

## Operating Context

- The public site is `crystallize.cc`. Readers use a browser on desktop or narrow screens.
- English is the default language at `/`; Traditional Chinese and Japanese are available at
  `/zh-tw/` and `/ja/`.
- Readers can browse by character or date, search the collection, navigate to individual entries,
  copy search URLs, and subscribe through `/rss.xml`.
- Source posts may be on Twitter, Pixiv, Fantia, or other linked platforms. External access and
  availability are governed by those platforms; a link does not promise unrestricted full-image access.
- Data and source images are maintained through the private admin and published into a static build.
  A saved admin change appears publicly only after publication.
- The existing application uses Astro static templates and vanilla TypeScript client behavior.
  Generated content and source-image manifests are fixed build inputs, with no runtime D1/R2 access.
- From the repository root, `pnpm run dev` starts the public development workflow on port 4321.
  Its image synchronization can access remote storage; fixture-based checks are separate from
  authenticated production verification.

## Capabilities and Constraints

- Character and timeline views offer two ways to explore the same collection. Archived characters
  are folded by default and can be expanded; archive status is distinct from hiding a work.
- Search covers character, creator, keyword, and date metadata, including registered aliases.
  Space-separated terms require all terms to match, `|` permits alternatives, and `!` excludes a term.
  Search suggestions and random discovery support browsing without a known target.
- Entries retain real preview images, dates, creator names, descriptive metadata, and source or design
  links where supplied. Missing links, unknown metadata, and unpublished works must remain explicit.
- Unpublished entries can record reader interest in the current browser. The existing interaction
  stores its recorded state locally and may emit an analytics event; it is not a release request,
  account subscription, purchase, or promise of publication.
- Stable opaque `publicId` values identify works across search, anchors, RSS, and interest state.
  Asset filenames and internal numeric IDs do not define public identity or metadata.
- Numbered parts are explicit relationships. Each part remains a separate work; do not silently
  group or merge records based on a shared character, illustrator, date, or source link.
- Deferred loading must preserve search completeness, shareable navigation, and scroll context.
  Loading, load failure, and genuinely empty results must stay distinguishable. Cached HTML must
  still be able to reach newer entries through the existing manifest fallback.
- Existing DOM contracts, snapshot validation, and asset handling remain governed by the repository
  and `apps/web/AGENTS.md`; this product record does not replace technical contracts.

## Brand Commitments

Preserve the name Commission Index, its existing localized names, Crystallize attribution, real
artwork, and factual collection copy. The voice is personal and direct: the owner commissions artwork
and encourages readers to follow and support its illustrators.

The existing site states that it contains NSFW illustrations, requires visitors to be 18 or older,
and asks readers not to repost. Preserve age confirmation and the leave action. Preserve the existing
copyright attribution, obscured character names where required by platform rules, and restrictions
on search-engine indexing. These indexing directives do not make the public site private.

Published contact channels are odaibako and email. Existing copy says requests to release or
redistribute illustrations will not receive a response; do not turn contact or interest controls into
an implied distribution service.

## Evidence on Hand

- `src/config/siteMeta.ts` contains the public name, description, canonical domain, and social metadata.
- `src/features/home/i18n/homeLocale.ts` contains existing multilingual introduction, attribution,
  contact, age-warning, and footer copy.
- `src/features/home/i18n/homeSearchControls.ts` contains search instructions and discovery labels.
- `src/features/home/pages/HomePage.astro`, `src/features/home/commission/`, and
  `src/features/home/search/` implement the public workflows.
- `src/layouts/BaseLayout.astro` and `public/robots.txt` contain indexing directives.
- `public/favicon*`, `public/nsfw-cover-s.*`, and `src/assets/fonts/` contain existing identity assets.
- `generated/` contains local, gitignored build snapshots and source images when exported. These are
  real collection inputs, not a license to invent entries or substitute generated artwork.
- Repository-level `test/visual/apps/web/` contains committed browser screenshot baselines; the
  corresponding specs and current source must be checked before treating them as current evidence.

Do not fabricate collection statistics, artist endorsements, availability claims, or testimonials.

## Product Principles

1. Let readers discover artwork and reach its original context with clear attribution.
2. Preserve exact work identity, metadata, explicit parts, and the owner's publication boundaries.
3. Keep browsing, search, shared links, and return navigation dependable as the collection grows.
4. Respect adult-content access, copyright, reposting, and distribution commitments in every workflow.
5. Preserve equivalent access to the collection across languages, screen sizes, and input methods.

## Accessibility & Inclusion

Preserve the existing keyboard and touch affordances, accessible image descriptions and control
names, search-result announcements, and age-dialog focus behavior. Preserve system light/dark
preferences and reduced-motion support, with usable navigation on narrow screens. Maintain localized
labels and document language for English, Traditional Chinese, and Japanese.

Product-specific assistive-technology needs or a formal conformance target beyond the existing
implementation remain undecided. This initialization does not constitute an accessibility audit.
