# domain

Shared domain types and pure business-facing contracts.

## Key Modules

- `content.ts` — public content model types (Commission, Character, Link)
- `factSource.ts` — generated fact-source contract for D1/R2 export and web build inputs
- `admin.ts` — admin-facing DTO and bootstrap payload types
- `search.ts` — search/suggestion type contracts
- `aliases.ts` / `characterAliases.ts` / `creatorAliases.ts` / `keywordAliases.ts` — alias types and normalization
- `dateSearch.ts` — date query parsing and token generation
- `commissionFileName.ts` — commission filename parsing
- `commissionSearchMetadata.ts` — search text / suggestion metadata builder
- `timeline.ts` — timeline grouping and year-nav helpers

## Rules

- Keep runtime-light and app-agnostic
- Pure types and pure logic only — never import from `apps/*`
- Single export surface at `src/index.ts`
- `GeneratedFactSourceMeta.revision` 是 content/manifest 共用的稳定内容版本，`exportedAt` 仅记录运行时间；图片 `objectKey` 为远端不可变身份，`relativePath` 为本地 canonical 路径
