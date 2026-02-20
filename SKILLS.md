# SKILLS

This file defines reusable repository skills for contributors and automation.

## Skill 1: Feature/UI Development

### Use when
- Adding pages/components/API handlers.
- Updating rendering logic in `app/` routes.

### Steps
1. Use Bun commands only.
2. Prefer aliases: `#components`, `#lib`, `#data`, `#commission`, `#admin/*`.
3. Keep TypeScript types explicit and avoid unnecessary `any`.
4. Validate route behavior in `bun dev` before final checks.

### Done criteria
- `bun run lint` passes.
- `bun run build` passes for runtime-affecting changes.

---

## Skill 2: Dev/Admin + SQLite Operations

### Use when
- Editing character/commission records.
- Modifying admin pages under `app/(dev)/admin`.
- Adjusting database access code.

### Steps
1. Access DB through `data/sqlite.ts` or `#lib/admin/db`.
2. Treat `/admin` as development-only tooling.
3. Ensure writes are blocked outside `NODE_ENV=development`.
4. If records changed, commit `data/commissions.db` together with the code changes.

### Done criteria
- `/admin` works in development.
- Production path behavior remains non-editable (`notFound()` fallback / stubbed writes).
- `bun run build` is executed after DB/admin-related edits.

---

## Skill 3: Image Asset Pipeline

### Use when
- Adding/replacing commission images.

### Steps
1. Optimize images.
2. Regenerate imports mapping.

### Commands
```bash
bun run scripts/convert.ts
bun run scripts/imageImport.ts
```

### Done criteria
- New assets are optimized and import map is up to date.

---

## Skill 4: Documentation Delivery

### Use when
- Updating README, process docs, or collaboration guidelines.

### Steps
1. Keep docs aligned with current code behavior.
2. Provide Bun-based command examples.
3. Include verification notes, not only change descriptions.

### Done criteria
- Documentation is actionable and reflects current runtime behavior.

---

## Global Definition of Done (DoD)

- Scope is minimal and goal-focused.
- No lint/build blockers for applicable changes.
- No secrets or credentials committed.
- Commit message and change set are traceable and clear.
