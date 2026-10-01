# web/test

- Vitest DOM tests declare `@vitest-environment jsdom` per file; no global setup is required
- `visual/` — Playwright visual regression specs

## Rules

- Run `pnpm run test` for logic changes
- Run `pnpm run test:visual` when touching: search shell, sidebars, mobile floating menus, admin icon/layout, or snapshot files
- Use small, stable locator screenshots — avoid image-heavy full-page baselines
- Verify visual delta is intentional on both desktop and mobile before updating snapshots
