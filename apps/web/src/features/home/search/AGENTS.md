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
  Hierarchy is type size and tone only (no chips, dividers or icons): uppercase 12px section label, 17px/600
  character, 14px keywords. Below `48rem` it is a full-height bottom sheet, the only state that dims and frosts the
  page; wider screens get an anchored popover with no page curtain, so the search row stays crisp. It sits outside `#search-popular-keywords`, because that row is `invisible` until populated and
  visibility inherits into a popover. A term click hides the popover before applying the query, so focus does not
  return to the trigger.
- Help and browse popovers: native `popover` does not position or animate itself. Their anchor positioning, 8px gap, collision fallbacks and transitions live together in the scoped CSS of `CommissionSearchIsland.astro`. Without CSS anchor support, keep the centered `m-auto` fallback.
- Any suggestion, stale or timeline interaction change needs regression test updates.
- Lifecycle: ClientRouter soft navigation never fires `pagehide` and runs bundled module scripts only once. Mount
  through `bindSoftNavMount` (`@lib/astro/softNavMount`) on `astro:page-load` and tear down on `astro:before-swap`.
  A mount that defers work (idle callback, dynamic import) must cancel it in its teardown and check a disposed flag
  after the import resolves.
