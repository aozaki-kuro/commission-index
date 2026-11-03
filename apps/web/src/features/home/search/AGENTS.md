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
  "All" trigger for the browse popover; there is no rotation. Featured chips are server-rendered from
  `computeFeaturedKeywordChips` (`commissionSearchIndex.ts`), the same function the controller runs, so hydration
  seeds its last-rendered key from the chips' `data-keyword` and keeps the nodes; chip clicks are delegated on
  `#search-keyword-list`. A chip tapped before the controller chunk loads is queued by `commissionSearchIsland.ts`,
  which loads the controller at once and passes it `pendingKeyword` (still `from: 'row'`). Only the entry-pool
  fallback is client-rendered, and only then does the row stay `invisible` until filled. The browse popover is server-rendered from
  `buildKeywordBrowseGroups` (`@lib/home/keywordBrowseGroups`): characters in sidebar order (active, then archived),
  each with its keywords (aliases collapsed). A keyword naming another listed character (or its
  character alias) is a co-appearance: it renders first as `w/ Name` with `data-browse-scope` and searches both
  characters (`Lucia "Kanaut Nishe"`), because the bare name would return everything of the other character.
  Artists (`buildCreatorBrowseTerms`) close the field: creators across all characters by work count, part suffixes
  folded, each searching its bare name.
  At every width it is one field of chips (scoped CSS; owner ruled 2026-11-01, reversing the earlier mobile-only chip
  field and the desktop type-only hierarchy): the sidebar and the hamburger already list characters to jump to, so the
  panel is filters. A character with terms takes a full row led by its tinted name chip, name-only characters
  (`data-browse-name-only`, set server-side) share rows, and Artists leads its group with a non-interactive tinted
  category chip (quieter type, default cursor, so it does not pass for a character filter). Every row must stay all tinted, one tinted plus outlined, or all outlined, so the tinted/outlined
  contrast must stay obvious in both themes. The Active/Archived labels are `sr-only`; archived characters stay in the
  field. Outlined chips hover like the featured row's chips (`KEYWORD_CHIP_SURFACE_CLASS`); character chips darken their
  tint (the link opacity fade barely shows on a tinted chip, and owner read them as unclickable).
  At `48rem` and up the field splits into two `[data-browse-column]`s, characters | artists at `3fr 2fr`, with 12px
  chips (between the row's 11px and the panel's 14px; owner found both too small and too large there) and `0.75rem`
  rows, inset `1.5rem` on all four sides (owner ruled 2026-11-02: a 1rem top and bottom pressed the chips against the
  frame). The popover spans the page column (`anchor(--search-column)` on `#commission-search`) plus `1.5rem` a side:
  owner ruled a flush edge unattractive and wider covering the sidebars, and the overhang clears both at 1280px
  (61px left, 41px right). At 1280x800 the field is 432px against the `min(70dvh, 34rem)` cap, so it does not scroll;
  if it outgrows the cap, rebalance the column ratio before widening. It stays an anchored popover, not a modal: it
  filters the listing under it and is opened repeatedly, so the page stays visible.
  Below `48rem` it is a full-screen panel headed by a 28px "Tags" title (`browseKeywordsTitle`, `aria-hidden`: the
  dialog's `aria-label` names it), not a bottom sheet
  (a sheet promises swipe-down to dismiss, which is not built), fading like the hamburger menu (220ms ease-out both
  ways, opacity only: `--ease-enter` is a third done in the first frame, which over a full screen reads as a cut),
  with no backdrop or page curtain; wider screens get an anchored popover, so the search row stays crisp. The panel
  locks page scroll with `html:has(#search-browse-popover:popover-open)` (a popover never does, and a drag out of a short list scrolls
  the listing), needs `height: auto` (the UA popover height is `fit-content`) and closes from an X in the hamburger
  toggle's spot and style (`STYLES.floatingButton`, `right-8 bottom-8`); its icon turns in from -90deg like the
  hamburger's, and the hamburger and keyword-button roots fade out while the panel is open so only that X shows.
  Closing goes through `browsePopoverClose.ts` (the X, Esc on the document, a term click): WebKit has no `overlay`
  and cuts a closing popover to `display: none` on its first frame (Safari 27.2), so the panel fades out while still
  open under `data-closing` and hides when that opacity transition ends. Do not hide it directly or let the X's
  `popovertarget` run (its click is cancelled); a native close mid-fade only resets the state. Closed popovers take
  no pointer events, because Chromium keeps them in the top layer for the exit transition.
  The mobile keyword button (`nav/hamburger/MobileKeywordButton.astro`) opens it from outside this island, so index
  warm-up also runs on the popover's `beforetoggle`. The list scrolls in an inner div, not the
  popover: `menu-glass`'s `backdrop-filter` makes the popover the containing block of that X, so a scrolling popover
  would carry it away. It sits outside `#search-popular-keywords`, because that row is `invisible` until populated in the entry-pool fallback and
  visibility inherits into a popover. A term click closes the popover before applying the query: the desktop popover
  hides at once, so focus does not return to the trigger and steal it back from the input.
- Help and browse popovers: native `popover` does not position or animate itself. Their anchor positioning, 8px gap, collision fallbacks and transitions live together in the scoped CSS of `CommissionSearchIsland.astro`. Without CSS anchor support, keep the centered `m-auto` fallback.
  The help trigger makes room for the copy/clear buttons with `transform`, never `right` (a layout transition runs on
  WebKit's main thread every frame), and it is an anchor only while its popover is open: WebKit also keeps an anchor
  element's transform transition on the main thread. `anchor()` follows the transformed box in Chromium and WebKit.
  No per-row entrance stagger on the browse popover: it is opened repeatedly while picking tags, so a cascade reads
  as lag (apple.com also cascades only on a cold open). The mobile hamburger menu keeps its stagger.
- Browse popover chip looks and hovers live in the scoped CSS; a color-hover or `transition-colors` utility on these
  buttons overrides it and must stay off. The popover never auto-opens while typing: the suggestion
  list is the type-to-narrow surface.
- Any suggestion, stale or timeline interaction change needs regression test updates.
- Lifecycle: ClientRouter soft navigation never fires `pagehide` and runs bundled module scripts only once. Mount
  through `bindSoftNavMount` (`@lib/astro/softNavMount`) on `astro:page-load` and tear down on `astro:before-swap`.
  A mount that defers work (idle callback, dynamic import) must cancel it in its teardown and check a disposed flag
  after the import resolves.
