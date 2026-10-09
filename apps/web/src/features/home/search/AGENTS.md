# home/search

Vanilla TS search for the home page. Goals: stable first paint, precise filtering, minimal interaction regression.

## Rules

- Pure logic modules must not read `window`/`document`; only DOM sync and renderers may.
- Keep one state owner. Controller-local state lives in `commissionSearchController.ts`; query derivation in `commissionSearchModel.ts`. Do not add a second store.
- New pure derivation goes in `commissionSearchIndex.ts`, not in a renderer.
- Do not duplicate the filter algorithm here; use `@lib/search`.
- Locale labels resolve from `../i18n/homeSearchControls.ts`.
- Keep search box, dropdown and stale hint DOM structure and classNames stable to avoid layout jumps.
- Help popover: native `popover` does not position or animate itself. Its anchor positioning, 8px gap, collision fallbacks and transitions live together in the scoped CSS of `CommissionSearchIsland.astro`. Without CSS anchor support, keep the centered `m-auto` fallback.
- Any suggestion, stale or timeline interaction change needs regression test updates.
- Lifecycle: ClientRouter soft navigation never fires `pagehide` and runs bundled module scripts only once. Mount
  through `bindSoftNavMount` (`@lib/astro/softNavMount`) on `astro:page-load` and tear down on `astro:before-swap`.
  A mount that defers work (idle callback, dynamic import) must cancel it in its teardown and check a disposed flag
  after the import resolves.
