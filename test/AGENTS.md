# Test AGENTS

## Tree

test/

- `setup.tsx`: Vitest DOM/global setup shared by React unit tests.
- `utils/tempCommissionDb.ts`: temporary SQLite fixture helper for admin/data tests.
- `visual/icon-regression.spec.ts`: Playwright visual regression suite for home/admin high-risk UI shells.
- `visual/icon-regression.spec.ts-snapshots/*`: committed baseline screenshots; update only for intentional visual changes.

## Rules

- Run `bun run test` for logic changes.
- Run `bun run test:visual` when touching search shell, sidebars, mobile floating menus, admin icon/layout hotspots, or snapshot files themselves.
- Use small, stable locator screenshots instead of full-page captures; avoid image-heavy full-page baselines.
- Before changing snapshots, verify the visual delta is intentional on both desktop and mobile states.
