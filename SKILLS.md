# SKILLS

This file defines reusable repository skills for contributors and automation.

When a task is not fully covered here, contributors/automation may reference external rules
(official docs, framework guidance, lint/tool docs, etc.) as needed. Repository-local rules
(`AGENTS.md`, this file, and task-specific instructions) take precedence if conflicts exist.

## Skill 1: Feature and UI Development

### Feature/UI: Use when

- Adding or updating pages, route handlers, and components in `app/`.
- Changing rendering logic, filtering/search behavior, or user-visible interactions.
- Adjusting frontend state hooks or navigation helpers.

### Feature/UI: Steps

1. Use Bun commands only (`bun run ...`).
2. Prefer path aliases over deep relative imports: `#components`, `#images`, `#commission`,
   `#data`, `#lib`, `#admin/*`.
3. Keep TypeScript types explicit; avoid unnecessary `any`.
4. Follow existing UI patterns unless intentionally redesigning a page.
5. For admin UI code, import write actions only from `#admin/actions` (never directly from
   `actions.dev.ts` or `actions.stub.ts`).
6. Smoke-check route behavior with `bun dev` when runtime behavior changes.

### Feature/UI: Done criteria

- User-visible behavior matches the intended route/page flow.
- Imports use repo aliases where appropriate.
- Lint/tests/build checks are run according to the validation skills below.

---

## Skill 2: Dev/Admin and SQLite Data Maintenance

### Admin/SQLite: Use when

- Editing commission or character records.
- Working in `app/(dev)/admin/*` (including `/admin/aliases`).
- Changing database access logic in `data/*` or `app/lib/admin/*`.

### Admin/SQLite: Steps

1. Treat `app/(dev)/admin` as development-only maintenance UI.
2. Ensure production behavior for `/admin` routes falls through to `notFound()` and does not
   expose editing.
3. Keep all write operations valid only in `NODE_ENV=development`.
4. Access SQLite through `data/sqlite.ts` (and existing admin DB helpers) rather than ad-hoc DB
   access.
5. Import admin actions from `#admin/actions` so dev/stub routing remains environment-swapped by
   Next config.
6. If content changes, include the matching `data/commissions.db` update in the same commit.
7. If alias data/behavior changes (`/admin/aliases`, creator aliases logic), run the related tests
   and verify both dev/admin flow and production-safe behavior.

### Admin/SQLite: Done criteria

- `/admin` tooling works in development.
- Production behavior remains non-editable / hidden (`notFound()` and stubbed writes as
  applicable).
- DB-backed content changes are committed with corresponding code changes.
- Required tests and `bun run build` have been executed for admin/data-access changes.

---

## Skill 3: Testing and Regression Validation

### Testing: Use when

- Changing component rendering, route behavior, admin flows, search/filter/date parsing, or
  navigation logic.
- Modifying `data/*`, `app/lib/*`, `app/(dev)/admin/*`, or `next.config.ts`.
- Fixing bugs that should be covered by regression tests.

### Testing: Steps

1. Run targeted Vitest files first for the modules you changed (fast feedback).
2. Run `bun run test` for non-trivial or cross-cutting changes.
3. Run `bun run lint` and resolve remaining issues after auto-fix.
4. Run `bun run build` for runtime/config/data-access/route/component logic changes.
5. In restricted/offline environments, use `bun run build:offline` when Google Fonts fetches fail.

### Testing: Done criteria

- Relevant tests pass for touched behavior.
- `bun run lint` passes (or only unrelated pre-existing issues remain, clearly noted).
- `bun run build` or `bun run build:offline` passes when required by the change type.

---

## Skill 4: Image Asset Pipeline and Pre-build Sync

### Image Pipeline: Use when

- Adding or replacing commission images.
- Updating image import mappings or cleaning unused image references.
- Investigating build issues related to image metadata generation.

### Image Pipeline: Steps

1. For new/updated assets, run the unified pipeline as needed:
   `bun run scripts/images.ts` (or `--convert-only` / `--import-only`).
2. Remember that normal dev/build flows run `bun run pre-build`, which executes
   `scripts/images.ts`.
3. If cleaning stale image references, use `bun run images:prune-unused`.
4. Verify generated image mappings and affected pages render correctly.

### Image Pipeline: Done criteria

- New assets are optimized and import mappings are up to date.
- Pre-build image generation is in sync (`bun run pre-build` succeeds).
- No broken image references appear in affected pages.

---

## Skill 5: Build, Export, and Deployment Constraints

### Build/Export: Use when

- Adding runtime features, routes, or config changes.
- Modifying `next.config.ts`, app router behavior, or deployment-related scripts.

### Build/Export: Steps

1. Assume static export compatibility matters (`next.config.ts` uses `output: 'export'`).
2. Validate changes with `bun run build` before finalizing runtime-affecting work.
3. If network-restricted, use `bun run build:offline` and keep
   `scripts/nextFontGoogleMock.ts` aligned with any `next/font/google` request changes.
4. Avoid introducing runtime assumptions that conflict with export/deploy behavior.

### Build/Export: Done criteria

- Runtime/config changes build successfully.
- Static export constraints are respected.
- Offline build path remains workable when font fetching is blocked.

---

## Skill 6: Documentation and Workflow Guidance

### Docs: Use when

- Updating `README.md`, process docs, collaboration notes, or repository guidance.
- Documenting new scripts, validation steps, or developer workflows.

### Docs: Steps

1. Keep docs aligned with current code behavior, scripts, and directory structure.
2. Prefer Bun-based command examples that match `package.json`.
3. Include verification notes, not only change descriptions.
4. Keep Markdown headings unique to avoid `MD024/no-duplicate-heading`.
5. If repository guidance is incomplete, cite relevant external rules/docs and note why they
   apply.

### Docs: Done criteria

- Documentation is actionable and reflects current behavior.
- Command examples match actual scripts/configuration.
- Markdown structure is lint-friendly (including unique headings).

---

## Global Definition of Done (DoD)

- Scope is minimal and goal-focused.
- Applicable validation steps (`lint`, `test`, `build`) are completed for the change type.
- No secrets or credentials are committed.
- Data/content edits include corresponding DB updates when required.
- Commit message and change set are traceable and clear.
