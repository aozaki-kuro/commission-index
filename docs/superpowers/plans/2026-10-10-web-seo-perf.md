# Web SEO & performance follow-up (2026-10-10)

Status: drafted from five read-only investigations — source SEO audit, build-output perf audit, live production
probe, and follow-up recons. Owner said go on 2026-10-10. Rewritten into Tasks 1-6 after the recons.

Auditing context: the site is **deliberately not indexed** — `public/robots.txt` `Disallow: /`, a `noindex` meta in
`BaseLayout.astro`, and a `X-Robots-Tag: noindex` header on `/*` that also covers `rss.xml`, `/search/*.json` and
`build-info.json`. All three layers agree and nothing escapes them. So the brief was: judge everything _except_
the blocking. SEO items that only pay off once indexing is unblocked are listed in "Out of scope" and are not work.

## Verified facts (all measurements; commands shown where not obvious)

### Live production (2026-10-10, `crystallize.cc`)

Lighthouse mobile and desktop, 3 runs each, median, `--blocked-url-patterns='*sight.crystallize.cc*'`:

| Page    | Perf | A11y | Best-pr | SEO | FCP     | LCP     | TBT  | CLS | Req | Bytes  |
| ------- | ---- | ---- | ------- | --- | ------- | ------- | ---- | --- | --- | ------ |
| mobile  | 97   | 97   | 100     | 69  | 1165 ms | 2644 ms | 0 ms | 0   | 38  | 738 KB |
| desktop | 100  | 100  | 100     | 69  | 366 ms  | 446 ms  | 0 ms | 0   | 34  | 588 KB |

- SEO 69 is the noindex gate alone — no other SEO audit fails. A11y 97 is one dark-mode contrast failure.
- Mobile LCP element is the age-gate paragraph `p.mt-2` (`You must be 18 or older…`); breakdown shows TTFB 226 ms
  and render delay 589 ms, leaving ≈1.8 s it does not account for.
- HTML TTFB ≈ 303–314 ms (median, `curl --http2 -H 'Accept-Encoding: br, gzip, zstd'`, 5 samples per URL,
  compressed wire bytes). `Content-Encoding: zstd` on HTML. `alt-svc: h3=":443"; ma=86400` is advertised but every
  sample negotiated `http_version=2`; no HTTP/3 observed. No 103 Early Hints and no `Link:` response header.
- Timing is measurement noise, not a signal: `curl`'s TTFB cannot separate "edge revalidated" from "edge served
  from cache", so "HTML re-hits origin on every request" is **not** established by these numbers.
- Hashed assets (`/_astro/*`, batch JSON, search entries): `Cache-Control: public, max-age=31536000, immutable`,
  `cf-cache-status: HIT`, `ETag` present, `If-None-Match` → 304. This is correct.
- HTML `/`: `no-cache`, `cf-cache-status: HIT`, **no `ETag`** → conditional requests still return 200 with the full
  body. `/ja/`, `/zh-tw/`: `public, max-age=0, must-revalidate`.
- Security headers present: `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`. No CSP (and `apps/web/AGENTS.md` says do not add
  one — Shiki inline styles, analytics origin).
- Routing: `http://` → 301 https → 200; `/ja` → 307 `/ja/`; `/index.html` → 307 `/`; `/JA/`, `/en/`, `/admin`,
  `/api/admin/bootstrap` → 404. `https://www.crystallize.cc` fails the TLS handshake
  (`SSL_ERROR_SYSCALL`), **state undetermined**.

### Build output (rebuilt from the existing snapshot, HEAD `cc7b7d4`)

`env FACT_SOURCE_USE_EXISTING_SNAPSHOT=1 pnpm run build:web` — no remote D1/R2 access, data revision identical to
the pre-existing `dist/`. Sizes via node `zlib` gzip -9 / brotli q11.

| File             | raw     | gzip   | brotli |
| ---------------- | ------- | ------ | ------ |
| index.html       | 193,221 | 27,343 | 21,074 |
| ja/index.html    | 194,068 | 28,254 | 21,637 |
| zh-tw/index.html | 193,010 | 27,985 | 21,354 |
| 404.html         | 7,608   | 2,334  | 1,930  |
| BaseLayout css   | 58,464  | 10,107 | 8,672  |

- `index.html` composition: body markup ≈140 KB, `<head>` 9.8 KB, inline `<script>` 29.7 KB (of which 20.6 KB is
  the two batch manifests), inline `<style>` 3.8 KB, inline `<svg>` 10 KB (26 icons). `<template>`: 0. DOM 1,068
  elements, depth 19.
- Fonts: 4 woff2. Preloaded: IBM Plex 400 (22.6 KB), IBM Plex 700 (22.8 KB), Berkeley Mono 400 (24.1 KB) = 69.5 KB.
  IBM Plex 600 (24.3 KB) is not preloaded. All `font-display: swap`, Astro emits fallback metrics
  (`size-adjust`/`ascent-override`). No CJK webfont — Japanese falls back to system fonts.
- JS: static entry JS ≈25 KB br (`HomeClientScript` 9.6, `jumpToCommissionSearch` 8.0, `ClientRouter` 5.0,
  `AgeGateScript` 0.9, `CommissionImageNoticeScript` 0.5, `CommissionSearchIsland` 0.4, plus shared
  `preload-helper` 0.7 / `softNavMount` 0.1). `commissionSearchController` 14.7 KB br and fuse.js 8.1 KB br load
  on idle. No duplication. **No `<link rel="modulepreload">` anywhere in `dist`.**
- Images: 414 webp = 21.4 MB, p50 45.5 KB, p90 83.2 KB, max 160 KB. Every `<img>` has `width`/`height` (→ CLS 0);
  46/47 have `srcset`; 45 lazy, 2 eager.
- Deferred search payload: 61 files, 882 KB raw / 142 KB br (36 character batches, 18 timeline batches, 6 manifests,
  search entries 6.7 KB br). Character batches are one character per file.
- Critical path, compressed, excluding image bytes: HTML 21 KB + CSS 8.7 KB + fonts 69.5 KB + JS 25 KB ≈ **124 KB**.

### Source-level SEO (read-only, `apps/web/`)

Present and correct: canonical per locale (absolute, self-referencing, single source in `siteMeta.ts` +
`BaseLayout.astro`), `<html lang>` in BCP-47 (`en`, `zh-Hant-TW`, `ja`), charset/viewport, theme-color + dark
sync, favicon set + manifest, real `<a href>` language switches with `aria-current`,
`redirectToDefaultLocale: false` with `prefixDefaultLocale: false`, unique `<h1>`, no heading-level skips,
`404-page` handling with a true 404 status and a back link, `publicId`-based commission anchors and RSS guids.

Absent: hreflang/x-default, sitemap.xml, JSON-LD, head RSS `rel="alternate"`, `<header>`/`<footer>` landmarks,
meaningful localized `alt` text. Three locales share one English `<title>` and one English description.

## Rulings (preflight, before any dispatch)

- **Ruling: execute in the main checkout, not a fresh worktree.** The owner has uncommitted doc work in flight
  (`AGENTS.md`, `apps/web/AGENTS.md`, `HANDOFF.md`) and this plan edits the same files. Cost if wrong: my edits
  sit in the same working tree as theirs and must be landed together.
- **Ruling: no commits, no pushes.** The owner's standing rule forbids committing without an explicit ask. Per-task
  review diffs are taken from working-tree snapshots (a throwaway `GIT_INDEX_FILE` + `git write-tree`), never from
  commits. Cost if wrong: finished work waits uncommitted.
- **Ruling: SEO work that only pays off once indexing is unblocked is out of scope.** Cost if wrong: done later.
- **Ruling: `www.crystallize.cc` and localized `<title>` are owner questions, not work.**
- **Ruling: WP-6 (defer search entries to first focus) is skipped.** The popular-keyword chips re-render when entries
  arrive, so deferring the fetch to focus moves a content jump into the moment the user interacts — the plan made
  this package conditional on not disturbing layout stability, and it does. Saves only ~6.7 KB br. Cost if wrong:
  non-searchers keep paying one 6.7 KB request.
- **Ruling: WP-4 `/ja/` and `/zh-tw/` need no rule.** Live probe 2026-10-10: they get Cloudflare's default
  `public, max-age=0, must-revalidate`, semantically equivalent to `no-cache`. Only the unhashed favicon and NSFW
  cover files are worked.
- **Ruling: WP-5 is in scope, reframed as privacy.** The two orphan jpgs are the original source images of
  `Hidden: true` commissions (ids 242, 248), publicly fetchable from `dist/_astro/`. Deploy size is secondary.
- **Ruling: WP-1 uses an opt-in pre-paint attribute, not "visible by default + `<noscript>`".** The inline script
  only marks the gate open when it must be; no-JS visitors keep never seeing the gate without a `<noscript>` patch.
- **Ruling: WP-2 aligns the preload to the inline `<img>`** (`widths [768,1280]`, `width 1280`); deferred batch JSON
  keeps `768/960/1280`. The preload must describe exactly the image it preloads.

## Tasks

Execute in order. Each task ends with its own verification. Unit-level gates per task; `test:visual` and the
rebuild run once in the final gate.

### Task 1: Age gate correct in the first frame (WP-1)

Context (verified 2026-10-10): `apps/web/src/features/home/warning/AgeGateScript.astro` renders the gate root with
`class="… hidden …" data-state="closed" aria-hidden="true"`; overlay and panel carry `opacity-0` and
`data-state="closed"`, and the open animation (`dialog-*-in`, 300 ms) runs from opacity 0. The gate is opened only by
the module script's `mountAgeGate()` (via `bindSoftNavMount`, i.e. on `astro:page-load`). The live HTML still ships
`hidden`. For a real unconfirmed first visit the gate text is therefore the LCP element, painted ≈1.8 s late.
The module decides "open" as: not `navigator.userAgent.toLowerCase().includes('lighthouse')` AND no
`localStorage.hasConfirmedAge` timestamp younger than 30 days.

Goal: for a visitor who will see the gate, the gate is visible (opaque, no entrance animation from transparent) in the
first painted frame; for a visitor who will not, nothing changes and nothing flashes.

Requirements:

1. A pre-paint `is:inline` script in `<head>` computes the same decision as `hasValidAgeConfirmation()` and, only when
   the gate must open, sets an opt-in attribute on `<html>` (e.g. `data-age-gate-initial="open"`) and sets
   `document.documentElement.dataset.ageGateOpen = 'true'` (read by `readAgeGateOpen` in
   `apps/web/src/features/home/nav/hamburger/mobileHamburgerMenu.ts`). Wrap localStorage access in try/catch;
   on failure treat as unconfirmed (same as the module's effective behavior — check it and match).
2. Place the script only on pages that render the gate: `HomePage.astro` already passes head content through
   BaseLayout's `<slot name="head" />` (see its `<script is:inline slot="head">`). Do not put gate logic into
   `BaseLayout.astro`.
3. The constants (storage key `hasConfirmedAge`, 30-day duration, UA token `lighthouse`) must have one definition
   shared by the inline script and the module script — e.g. a small TS module exported constants, imported by the
   module script and passed to the inline script with `define:vars`. No duplicated literals.
4. CSS keyed on the opt-in attribute shows the root (`display:flex`) and makes overlay/panel fully opaque with no
   animation until the module takes over. When `mountAgeGate()` runs and decides "open", it must adopt the
   already-visible state without replaying the entrance animation, then remove the opt-in attribute. When it decides
   "closed" (e.g. confirmation arrived in another tab before mount), it removes the attribute and closes normally.
5. No-JS visitors: the attribute is never set, so the gate stays hidden exactly as today. Do not add `<noscript>`.
6. Soft navigation (ClientRouter): confirmed users must not see a flash on locale switch; the module still runs on
   every `astro:page-load`. Verify how ClientRouter treats `<html>` attributes and identical inline head scripts
   across swaps (Astro docs via the astro-docs/context7 MCP) and make sure a stale attribute cannot leave the gate
   visible after the module closed it.
7. Keep: focus trap, Escape suppression, scroll lock, `age-gate-state-change` event, `storage` sync, the Lighthouse UA
   allowlist, cleanup on unmount.

Tests: add unit coverage for the decision logic if you extract it as a pure function (jsdom per-file env, see root
AGENTS.md "Unit Test Scope"); otherwise explain why not. Gate: `pnpm run lint`, `pnpm run typecheck`,
`pnpm run test` (sequentially). Do not run or update visual baselines — the controller runs `test:visual` at the end.
Also run `pnpm -C apps/web exec astro check .` and a manual check in `pnpm run dev` with Playwright MCP or the
built-in browser if available, against `http://localhost:4321/`, with requests to `sight.crystallize.cc` blocked:
first visit (empty localStorage) shows the gate in the first screenshot; after confirming and reloading, no gate.

### Task 2: LCP preload matches the inline `<img>` (WP-2)

Context (verified): `apps/web/src/features/home/pages/HomePage.astro:113-117` builds the preload with
`getImage({ widths: [768, 960, 1280], format: 'webp', sizes })` and no `width`; the image it preloads is rendered by
`apps/web/src/features/home/commission/ProtectedCommissionImage.astro` with `widths={[768, 1280]}`, `width={1280}`.
`COMMISSION_IMAGE_SIZES = '(max-width: 768px) 92vw, 640px'` is defined three times: `HomePage.astro:86`,
`ProtectedCommissionImage.astro:14`, and exported from `apps/web/src/features/home/server/batchPayloadBuilder.ts:8`.
Deferred batch images use `widths: [768, 960, 1280]` (`batchPayloadBuilder.ts:35`) — leave those unchanged.

Requirements:

1. Define the inline-image widths (`[768, 1280]`) and width (`1280`) once, next to the exported
   `COMMISSION_IMAGE_SIZES` in `batchPayloadBuilder.ts`; `HomePage.astro` and `ProtectedCommissionImage.astro` import
   these and `COMMISSION_IMAGE_SIZES` instead of local copies.
2. The preload's `getImage` call passes the same `widths`, `width`, `format`, `sizes` as the `<Image>`.
3. Update the widths line in root `AGENTS.md` ("Listing widths: `768/960/1280` …", under Guardrails → Images) to
   state both: inline `<img>` and LCP preload use 768/1280 (width 1280); deferred batch images use 768/960/1280.
   Edit only that line — the file has unrelated uncommitted owner edits.

Gate: lint, typecheck, test (sequentially), then rebuild from the existing snapshot without remote access:
`FACT_SOURCE_USE_EXISTING_SNAPSHOT=1 pnpm run build:web`. In `apps/web/dist/index.html` confirm the preload
`imagesrcset` set equals the first commission `<img srcset>` set, and that the preload `href` equals the `<img src>`.
Quote both in the report.

### Task 3: Dark-mode tab contrast + `_headers` for unhashed static files (WP-3, WP-4)

Two small independent edits, one dispatch.

WP-3: inactive mobile view-mode tab uses `dark:text-gray-500` (3.71:1 on the dark background). Change it to
`dark:text-gray-400` in `apps/web/src/features/home/commission/MobileViewModeTabs.astro` (inactive buttons' class
lists) and in `apps/web/src/features/home/commission/mobileViewModeTabs.ts` `syncToggleButtonState`
(`classList.toggle('dark:text-gray-500', !active)`), and update the fixture in `mobileViewModeTabs.test.ts`. Do not
touch light-mode classes or theme tokens. Grep for any other `dark:text-gray-500` tied to the same toggle state and
report (do not change unrelated ones).

WP-4: `apps/web/public/_headers` has no rule for `/favicon.ico`, `/favicon.svg`, `/favicon-transparent.svg`,
`/favicon/*` or `/nsfw-cover-s.{jpg,webp}`; live they get `public, max-age=0, must-revalidate`. These files are not
content-hashed, so they must not be `immutable`. Add rules giving them `Cache-Control: public, max-age=86400`
(assumption: a one-day staleness window after replacing a favicon is acceptable). Confirm the Cloudflare Workers
static-assets `_headers` matching semantics for splats (does `*` cross `/`? do multiple matching rules merge
headers?) from the Cloudflare docs MCP before choosing patterns, and quote the doc line in the report. Do not
change any existing rule.

Gate: `pnpm run lint`, `pnpm run test` (sequentially). Report the new contrast ratio of `gray-400` on the dark
background (`neutral-900`) computed from the Tailwind 4 oklch values.

### Task 4: RSS escaping and channel metadata (WP-7)

Context: `apps/web/src/lib/rss.ts` interpolates `item.title`, `item.author`, `item.link`, `item.guid` into XML
unescaped; `rssItem.ts` builds them (description is already CDATA). No current record contains `&`/`<`, so this
is latent. Tests live in `apps/web/src/lib/rss.test.ts`.

Requirements:

1. XML-escape (`& < > " '`) every interpolated text value in the feed (titles, author, link, guid, channel
   strings). Keep the description CDATA, but make sure a `]]>` inside it cannot break out.
2. Add `xmlns:atom="http://www.w3.org/2005/Atom"` and `<atom:link href="https://crystallize.cc/rss.xml" rel="self"
type="application/rss+xml" />` to the channel.
3. Add `<lastBuildDate>`: use the newest item `pubDate` (deterministic across rebuilds of the same data), omit when
   no item has a date. Do not use the wall clock.
4. Add `<link rel="alternate" type="application/rss+xml" title="Crystallize's Commission Index" href="/rss.xml" />`
   to the `<head>` in `apps/web/src/layouts/BaseLayout.astro` (single place for all pages; reuse an existing
   site-title constant if one fits — `SiteMeta` in `@config/siteMeta`).
5. Tests: a commission whose character/creator contains `&` and `<` yields well-formed XML (parse it, e.g.
   with a DOMParser under jsdom or a minimal check), atom self link present, lastBuildDate equals newest pubDate.

Gate: lint, typecheck, test (sequentially).

### Task 5: Hidden commissions' source images must not ship (WP-5)

Context (verified): `apps/web/src/lib/images/sourceImageRegistry.ts:18-21` eager-globs every file under
`/generated/source-images/**`. Two files in `apps/web/dist/_astro/` (`20250714_Rman.*.jpg` 292,000 B,
`20260316_EyeRune.*.jpg` 289,600 B) are referenced by no page and are the originals of `Hidden: true` commissions
(ids 242, 248). They ship because the import emits the original asset; visible images are emitted only as webp
variants via `getImage`.

Goal: the build output contains no file derived from a hidden commission's source image, while visible commissions
behave exactly as before and the export contract (every commission has a `source_images` row; manifest stays
complete) is unchanged.

Requirements: find the root cause (why the eager import emits the original, and where `Hidden` is known — check the
generated content/manifest and `packages/domain`), then fix at the source rather than deleting files after build.
Candidate directions — pick with evidence: lazy (non-eager) glob resolved only for visible commissions; filtering the
glob input by the manifest. If neither works without breaking the "missing image surfaces as missing" rule or the
dev server, report BLOCKED with findings instead of hacking a post-build delete. Do not touch the fact-source export
or anything remote.

Gate: lint, typecheck, test (sequentially); rebuild with `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1 pnpm run build:web`;
show `ls dist/_astro/*.jpg dist/_astro/*.png` before/after and confirm the visible pages' image count is unchanged.

### Task 6: Why no `<link rel="modulepreload">` (investigation)

`dist/` contains zero `modulepreload` links although Vite 8 defaults `build.modulePreload: true`. Investigate
(read-only first) how Astro 7 configures the client build and whether modulepreload is intentionally disabled or
injected differently for hoisted scripts. Use the astro-docs MCP and node_modules source. Change config only if a
single, documented setting restores it and a rebuild shows the links; otherwise report findings only.

### Task 7: Localized `<title>` and description (owner approved 2026-10-10)

Context: all three home locales share `SiteMeta.site` (`Commission Index`) as `<title>`/`og:title`/`twitter:title`
and the English `SiteMeta.description` as `description`/`og:description`/`twitter:description`
(`apps/web/src/layouts/BaseLayout.astro`). Per-locale messages live in
`apps/web/src/features/home/i18n/homeLocale.ts` (`HomeLocaleMessages`); each locale already has a page heading in
`description.heading`: en `Commission Index`, zh-tw `委託索引`, ja `コミッション一覧`.

Requirements:

1. Add a `meta: { title: string, description: string }` group to `HomeLocaleMessages` with values:
   - en: title `Commission Index`, description `The collection of commissioned NSFW illustrations / Do Not Repost`
     (identical to today's output — the en page must not change).
   - zh-tw: title `委託索引`, description `委託繪製的 NSFW 插畫收藏／請勿轉載`
   - ja: title `コミッション一覧`, description `依頼して描いていただいた NSFW イラストのコレクション／無断転載禁止`
     (zh/ja descriptions are controller-drafted translations pending owner confirmation.)
2. `BaseLayout.astro` gains the ability to take a full page title for the home page without the
   `${title} | ${SiteMeta.site}` suffix logic breaking the 404 page (`404.astro` passes `title="404"` and must still
   render `404 | Commission Index`). Choose the smallest prop change; `<title>`, `og:title` and `twitter:title` all use
   the localized title; `description`, `og:description`, `twitter:description` use the localized description.
   `og:site_name` and `application-name` stay `SiteMeta.site` (brand).
3. `HomePage.astro` passes the locale's `meta.title`/`meta.description`.
4. Tests: extend `homeLocale.test.ts` (or the nearest existing test) to assert every locale defines non-empty
   `meta.title`/`meta.description` and that en equals `SiteMeta` values.

Gate: lint, typecheck, test (sequentially); rebuild with `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1 pnpm run build:web`
and quote `<title>`, `og:title`, `meta name="description"` from `dist/index.html`, `dist/zh-tw/index.html`,
`dist/ja/index.html`, `dist/404.html`; en output must be byte-identical in those tags to before.

## Out of scope (listed, not worked)

Only worth doing if indexing is ever unblocked: sitemap.xml + a `Sitemap:` line in robots.txt; hreflang with
x-default; JSON-LD (`WebSite`/`SearchAction`, `CollectionPage`, `ImageObject`); `<header>`/`<footer>` landmarks;
localized title/description for crawlers; making the ~93 deferred commissions crawlable without JS. The one item
here with value _today_ is localized `<title>`/description, because it shows in the browser tab and in link
previews — treat it as optional and separate.

`og:image` being a root-relative URL is **downgraded to non-issue**: Discord renders the thumbnail correctly today,
which is direct evidence that at least some scrapers resolve it against the page URL. Making it absolute is a
one-line change with no downside, but it is not a defect and is not worth a work package.

## Constraints that bind every package

- `apps/web` import aliases (`@layouts/*`, `@features/*`, `@lib/*`); no `#` aliases.
- Do not enable CSP.
- Keep the deferred-loading contract and the `data-*` DOM contracts; no `pagehide` in soft nav (ClientRouter never
  fires it), mount via `bindSoftNavMount` on `astro:page-load`.
- Never let a CJK/kana search term be wrapped in `\b` (JS `\b` is ASCII-only).
- Run pnpm commands **sequentially** — parallel pnpm in one checkout races on `node_modules/.pnpm`.
- Markdown is linted by ESLint at `--max-warnings=0`; keep tables aligned.

## Gates for the whole branch

`pnpm run lint` → `pnpm run typecheck` → `pnpm run test` → `pnpm run test:visual` (desktop and mobile baselines
confirmed by eye) → rebuild from the existing snapshot → re-probe the live headers and re-run Lighthouse for
WP-1/WP-2/WP-3 before claiming any number improved.
