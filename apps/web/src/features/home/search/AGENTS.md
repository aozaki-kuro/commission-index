# home/search

Vanilla TS search for the home page. Goals: stable first paint, precise filtering, minimal interaction regression.

## Rules

- Pure logic modules must not read `window`/`document`; only DOM sync and renderers may.
- Keep one state owner. Controller-local state lives in `commissionSearchController.ts`; query derivation in `commissionSearchModel.ts`. Do not add a second store.
- New pure derivation goes in `commissionSearchIndex.ts`, not in a renderer.
- Do not duplicate the filter algorithm here; use `@lib/search`.
- Locale labels resolve from `../i18n/homeSearchControls.ts`.
- Keep search box, dropdown and stale hint DOM structure and classNames stable to avoid layout jumps.
- Keyword row: the admin-curated featured keywords (the entry-derived pool only when none are set) plus a fixed
  "All" trigger for the browse popover; there is no rotation. The browse popover is server-rendered from
  `buildKeywordBrowseGroups` (`@lib/home/keywordBrowseGroups`): an Active and an Archived section, characters in
  sidebar order, each with its keywords (aliases collapsed). A keyword naming another listed character (or its
  character alias) is a co-appearance: it renders first as `w/ Name` with `data-browse-scope` and searches both
  characters (`Lucia "Kanaut Nishe"`), because the bare name would return everything of the other character.
  Hierarchy is type size and tone only (no chips, dividers or icons): 14px sentence-case section label in gray-500/400 (the same label as the hamburger's Active/Archived toggles; no
  uppercase or tracking), 17px/600
  character in gray-900/100, 14px keywords one tone lower (gray-600/400, set on the buttons: the `li` base rule sets
  color, so a tone on the `ul` never applies). That hierarchy is the desktop popover only. Below `48rem` the same DOM
  is one field of pill chips in sidebar order (scoped CSS; owner ruled mobile-only): the hamburger already lists
  characters to jump to, and two big-text character lists read as duplicates. A mobile-only 28px "Tags" title
  (`browseKeywordsTitle`, `aria-hidden`: the dialog's `aria-label` names it) heads the field. The section labels go `sr-only`, the
  sections merge, a character with terms takes a full row led by its tinted name chip, and name-only characters
  (`data-browse-name-only`, set server-side) share rows. Every row must stay all tinted, one tinted plus outlined, or all
  outlined, so the tinted/outlined contrast must stay obvious in both themes. Below `48rem` it is a full-screen panel (not a bottom sheet:
  a sheet promises swipe-down to dismiss, which is not built), fading in like the hamburger menu, with no backdrop or
  page curtain; wider screens get an anchored popover, so the search row stays crisp. The panel locks page scroll
  with `html:has(#search-browse-popover:popover-open)` (a popover never does, and a drag out of a short list scrolls
  the listing), needs `height: auto` (the UA popover height is `fit-content`) and closes from an X in the hamburger
  toggle's spot and style (`STYLES.floatingButton`, `right-8 bottom-8`); its icon turns in from -90deg like the
  hamburger's, and the hamburger and keyword-button roots fade out while the panel is open so only that X shows.
  The mobile keyword button (`nav/hamburger/MobileKeywordButton.astro`) opens it from outside this island, so index
  warm-up also runs on the popover's `beforetoggle`. The list scrolls in an inner div, not the
  popover: `menu-glass`'s `backdrop-filter` makes the popover the containing block of that X, so a scrolling popover
  would carry it away. It sits outside `#search-popular-keywords`, because that row is `invisible` until populated and
  visibility inherits into a popover. A term click hides the popover before applying the query, so focus does not
  return to the trigger.
- Help and browse popovers: native `popover` does not position or animate itself. Their anchor positioning, 8px gap, collision fallbacks and transitions live together in the scoped CSS of `CommissionSearchIsland.astro`. Without CSS anchor support, keep the centered `m-auto` fallback.
  No per-row entrance stagger on the browse popover: it is opened repeatedly while picking tags, so a cascade reads
  as lag (apple.com also cascades only on a cold open). The mobile hamburger menu keeps its stagger.
- Browse popover terms carry `data-link-style` plus `no-underline`: the site's opacity hover without the prose
  underline. The character header also slides in a chevron on hover. A color-hover or `transition-colors` utility on
  these buttons overrides the base rule and must stay off. The popover never auto-opens while typing: the suggestion
  list is the type-to-narrow surface.
- Any suggestion, stale or timeline interaction change needs regression test updates.
- Lifecycle: ClientRouter soft navigation never fires `pagehide` and runs bundled module scripts only once. Mount
  through `bindSoftNavMount` (`@lib/astro/softNavMount`) on `astro:page-load` and tear down on `astro:before-swap`.
  A mount that defers work (idle callback, dynamic import) must cancel it in its teardown and check a disposed flag
  after the import resolves.
