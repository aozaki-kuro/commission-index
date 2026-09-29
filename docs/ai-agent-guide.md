# Commission Index — AI Agent Integration Guide

This guide documents implicit behaviors, serialization rules, normalization quirks, and
workflow patterns that are not visible from the endpoint list in `api-reference.md`. Read
this before writing automation or an AI agent against the admin API.

---

## 1. Base URL Resolution

The frontend resolves the API base URL at runtime via `getAdminApiBaseUrl()`:

| Context                  | URL                                                              |
| ------------------------ | ---------------------------------------------------------------- |
| Production (same-origin) | `""` (relative paths, e.g. `/api/admin/health`)                  |
| Local dev (default)      | `http://127.0.0.1:8787`                                          |
| Custom override          | Value of `ADMIN_API_BASE_URL` env var, trailing slashes stripped |

For an external agent or script, default to `http://127.0.0.1:8787` in dev. In production
the worker is behind Cloudflare Zero Trust and same-origin, so agent calls from outside the
browser must supply the Zero Trust access token (cookie or header as appropriate).

There is no CORS requirement in production — the admin frontend and API are same-origin.
Local dev allows any `*.localhost` or `127.0.0.1:*` origin.

---

## 2. Retry Strategy

The frontend's `fetchAdminJsonWithRetry` uses the following constants:

```ts
const DEFAULT_ATTEMPTS = 4 // up to 4 total attempts
const DEFAULT_BASE_DELAY_MS = 250 // base backoff delay
const DEFAULT_REQUEST_TIMEOUT_MS = 8000 // per-request abort timeout
```

**Backoff schedule** (linear, not exponential):

| Attempt | Delay before attempt |
| ------- | -------------------- |
| 1       | 0 ms (immediate)     |
| 2       | 250 ms               |
| 3       | 500 ms               |
| 4       | 750 ms               |

Each request is individually aborted after 8 000 ms via `AbortController`.

**Retry rule:** A non-ok HTTP response (including 4xx) causes the helper to throw, which is
treated like a network error and retried up to `DEFAULT_ATTEMPTS` times. This means 4xx
responses will be retried for GET endpoints. **For mutation endpoints (POST/PATCH/PUT/DELETE)
you must use a single-attempt fetch or implement idempotency guards** — retrying a mutation
on 4xx will repeat the failed write attempt and may cause duplicate writes or conflicting
state.

> **Cross-reference — commission identity and image operations:** See Section 8. PATCH
> changes metadata only; it does not rename, move, copy, or delete the referenced R2 object.

---

## 3. Commission Identity Fields

Use the numeric `id` as the stable identity for every commission. Create and PATCH requests
must send `commissionDate` as a real calendar date in `YYYY-MM-DD` format and `creatorName`
as a string or `null` when unknown. PATCH is a full metadata update: include both fields on
every request. Do not send or derive identity from `fileName`; it remains an internal legacy
compatibility field during migration.

Dates and creator names are ordinary metadata. Editing either field does not rename, move,
copy, or delete the existing source-image object. Use
`/api/admin/commissions/:id/source-image` to read or replace image bytes.

### Legacy file name (migration history only)

```
YYYYMMDD
YYYYMMDD_creator
```

- This historical filename pattern is not the create/PATCH API contract and must not be used
  to derive commission identity, date, creator, or image URLs.

### Valid / invalid examples

```
20240315            valid — date only
20240315_artistname valid — date + creator
20240315_艺术家       valid — CJK creator names are supported
20240315_foo_bar    valid — underscores after the first are part of the creator name
20240315.jpg        INVALID — must not include an image extension
2024031             INVALID — date must be 8 digits
20240315_           INVALID — trailing underscore produces empty creator segment
                             (passes regex but trim makes creator empty)
```

### Forbidden characters

`< > : " / \ | ? *`, `..` sequences, and any control character (codepoint ≤ 0x1F).

### Legacy creator parsing

The part after the first `_` was historically treated as a creator name. This parse rule is
for migration review only; it must not overwrite explicit API fields. For FormData create,
send an empty `creatorName` string when unknown; the Worker stores it as `null`.

### CJK support

CJK characters in the creator name segment are supported. `hasCjkCharacter` is used for
display/search hinting only; it does not affect validation.

---

## 4. Links Field Serialization

The `links` field is stored as a JSON string in D1 but handled differently depending on
the request type.

| Context                            | Format                                        | Notes                                          |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| GET response body                  | JSON array `["url1", "url2"]`                 | Already parsed from D1 JSON string             |
| `PATCH /commissions/:id` JSON body | newline-separated string `"url1\nurl2"`       | Worker calls `parseLinks` which splits on `\n` |
| `POST /commissions` FormData       | newline-separated string in the `links` field | Same `parseLinks` splitting                    |

**Sending links in a POST (FormData):**

```ts
const form = new FormData()
form.append('links', 'https://example.com/a\nhttps://example.com/b')
// Worker splits on \n internally
```

**Sending links in a PATCH (JSON):**

```ts
const body = {
  links: 'https://example.com/a\nhttps://example.com/b',
  // ... other fields
}
fetch('/api/admin/commissions/42', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
```

Do NOT send a JSON array for `links` in PATCH — the worker coerces `payload.links` with
`String()` before splitting, so `["url1","url2"]` becomes the literal string
`"url1,url2"` and will be treated as one link.

---

## 5. Keyword Field

The `keyword` field is a comma-separated string, not an array.

**What you send:**

```
"full body, NSFW, solo"
```

**What the worker stores (after normalization):**

Keywords are split on `,`, `\n`, `，`, `、`, `;`, `；`. Each term is trimmed and
multi-spaces collapsed. Empty terms are dropped. Duplicates are removed (case-insensitive
dedup, first occurrence wins). Result is joined back with `", "`.

**Example round-trip:**

```
Input:   "Full Body,  nsfw , solo, Full Body"
Stored:  "Full Body, nsfw, solo"
```

`normalizeKeywordAliases` is applied during this normalization (aliases map normalized
keyword terms). The final stored value uses the canonical term from the alias map when
a match exists.

**What comes back in GET responses:**

The keyword field is returned as a normalized comma-separated string exactly as stored,
e.g. `"Full Body, nsfw, solo"`. When reading `keyword` from a GET response, split on `,`
(comma). The broader separator pattern (`/[,\n，、;；]/`) is for user input normalization
on write — do not use it to parse API responses.

---

## 6. Alias Batch Semantics

**CRITICAL: alias batch endpoints are upsert-per-row, not full-replace.**

Each `POST .../batch` call iterates the submitted rows and:

- Upserts rows with non-empty aliases (INSERT ... ON CONFLICT DO UPDATE).
- **Deletes** rows from D1 whose aliases normalize to an empty array.

Rows not mentioned in the request are NOT touched.

This means partial updates are safe — you can POST only the changed rows. However, if
you want to **delete** an entry, you must POST it with an empty aliases value, not simply
omit it.

There are three distinct batch endpoints — **use the correct one for each alias type**:

| Alias type        | Endpoint                                  |
| ----------------- | ----------------------------------------- |
| Creator aliases   | `POST /api/admin/aliases/batch`           |
| Character aliases | `POST /api/admin/character-aliases/batch` |
| Keyword aliases   | `POST /api/admin/keyword-aliases/batch`   |

**Wrong pattern (omitting a row does not delete it):**

```ts
// Before: { creatorName: "artistA", aliases: ["a1"] }
//         { creatorName: "artistB", aliases: ["b1"] }
// Goal: remove artistA

// WRONG — artistA is untouched
// Substitute the correct endpoint path per alias type:
//   /aliases/batch           for creators
//   /character-aliases/batch for characters
//   /keyword-aliases/batch   for keywords
await fetch('/api/admin/aliases/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows: [{ creatorName: 'artistB', aliases: ['b1'] }] }),
})
```

**Correct pattern (explicit empty aliases to delete):**

```ts
// CORRECT — explicitly pass empty aliases to trigger DELETE
// Substitute the correct endpoint path per alias type:
//   /aliases/batch           for creators
//   /character-aliases/batch for characters
//   /keyword-aliases/batch   for keywords
await fetch('/api/admin/aliases/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rows: [
      { creatorName: 'artistA', aliases: [] }, // triggers DELETE
      { creatorName: 'artistB', aliases: ['b1'] },
    ],
  }),
})
```

**Supported row shapes** (all three alias endpoints accept these fields):

```ts
// Creator aliases
{ creatorName: string, aliases: string[] | string }
// also accepts legacy: { creatorName: string, alias: string }

// Character aliases
{ characterName: string, aliases: string[] | string }

// Keyword aliases
{ baseKeyword: string, aliases: string[] | string }
```

The `aliases` field can be a string with comma/semicolon/newline separators — the worker
calls `normalizeAliases` / `normalizeKeywordAliases` to split it.

> **Note — silent-empty response for missing character:**
> `GET /api/admin/characters/:id/commissions` returns `{ commissions: [] }` for both
> "character exists but has no commissions" AND "character ID does not exist" — no 404 is
> returned. If you need to distinguish these cases, check the character's existence in
> bootstrap data first.

---

## 7. Character Order Update

`PUT /api/admin/characters/order` sets the `sort_order` for **every character** in the
database. It also authoritative-sets the `status` column for each ID based on which array
it appears in.

**You must include ALL character IDs in the payload.** Any ID omitted will keep its
previous `sort_order` but will NOT have its status updated. More importantly, the
`sort_order` values of included characters are set to sequential integers starting from 1
based on array position — so omitting IDs creates gaps.

**Safe read-modify-write pattern:**

```ts
// 1. Fetch current character list
const bootstrap = await fetchAdminJsonWithRetry<AdminBootstrapData>('/api/admin/bootstrap')

// 2. Build arrays preserving all IDs
const activeIds = bootstrap.characters
  .filter(c => c.status === 'active')
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(c => c.id)

const archivedIds = bootstrap.characters
  .filter(c => c.status === 'archived')
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(c => c.id)

// 3. Make your desired change, e.g. move id=5 to archived
const newActiveIds = activeIds.filter(id => id !== 5)
const newArchivedIds = [5, ...archivedIds]

// 4. PUT with complete lists
// single-attempt — mutation must not be retried (see Section 2)
await fetch('/api/admin/characters/order', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ active: newActiveIds, archived: newArchivedIds }),
})
```

---

## 8. Commission Create vs Update: Source Image Handling

There are three separate operations with different image semantics:

| Operation         | Endpoint                                       | Image behavior                                                                  |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Create commission | `POST /api/admin/commissions`                  | FormData with explicit `commissionDate`, `creatorName`, and `sourceImage`       |
| Update metadata   | `PATCH /api/admin/commissions/:id`             | JSON body with explicit date/creator fields — never touches the R2 object       |
| Read image        | `GET /api/admin/commissions/:id/source-image`  | Resolves the image by stable commission ID                                      |
| Replace image     | `POST /api/admin/commissions/:id/source-image` | FormData with `sourceImage`; the commission ID identifies the metadata relation |

Changing `commissionDate` or `creatorName` with PATCH does not rename, move, copy, overwrite,
or delete an R2 object. The stable commission ID continues to resolve the same image.
`fileName` is a legacy internal compatibility field and is not a caller-supplied identity.

**POST atomicity:**

`POST /api/admin/commissions` uploads an immutable image object to R2 first, then inserts the
commission and its image reference in D1. D1 and R2 do not share a transaction. If the D1
result is ambiguous or fails after upload, retain the object until the D1 state is checked;
do not delete it as automatic compensation.

---

## 9. Source Image Constraints

**Accepted MIME types / extensions:**

| MIME type    | Extension stored |
| ------------ | ---------------- |
| `image/jpeg` | `.jpg`           |
| `image/png`  | `.png`           |

`image/webp` is listed in the worker's file-name extension pattern but is NOT supported
for upload (resolveUploadExtension returns null for webp). Only JPEG and PNG uploads are
accepted.

Extension resolution priority: MIME type first, then filename extension as fallback.

**Duplicate behavior (create):**

The create endpoint accepts `commissionDate` and `creatorName`; callers do not supply a
filename. The Worker assigns its internal compatibility value. New images use unique,
immutable R2 keys; a failed or ambiguous D1 create can leave an unreferenced object. Keep it
until the D1 result is checked, and do not overwrite or delete another commission's object.

**R2 cleanup on replacement:**

The worker updates D1 to the new immutable key before deleting the previous referenced object.
Cleanup is best effort; failure leaves an orphan and does not turn a committed update into an
error.

**R2 cleanup on commission delete:**

Deleting a commission via `DELETE /api/admin/commissions/:id` removes the D1 metadata row and
commission record atomically but leaves its R2 object as an orphan. R2 cleanup is the
operator's responsibility; never delete objects solely because they are absent from one
potentially stale export snapshot.

---

## 10. Keyword Normalization (Aliases)

`normalizeKeywordAliases` is applied to alias arrays on write. Rules:

1. Split on `/[,\n，、;；]/` (comma, newline, fullwidth comma, enumeration comma, semicolon, fullwidth semicolon).
2. Trim each term and collapse internal whitespace.
3. Drop empty terms.
4. Dedupe case-insensitively (first occurrence wins, original casing preserved).

**Example:**

```
Input rows: [
  { baseKeyword: "Full Body", aliases: "full body, FullBody , full body" },
]

Stored: baseKeyword = "Full Body", aliases = ["full body", "FullBody"]
// "full body" appears twice → deduped; "FullBody" has different casing → kept
```

`normalizeKeywordBaseTerm` on `baseKeyword`: trim + collapse spaces. The lookup key is
then lowercased (`normalizeKeywordAliasKey`), so `"Full Body"` and `"full body"` map to
the same D1 row.

---

## 11. Bootstrap Load Strategy

The frontend loads all initial data in parallel via `fetchAdminOverviewPayload`:

```ts
const [health, bootstrap, aliases, suggestion] = await Promise.all([
  fetchAdminJsonWithRetry('/api/admin/health'),
  fetchAdminJsonWithRetry('/api/admin/bootstrap'),
  fetchAdminJsonWithRetry('/api/admin/aliases/bootstrap'),
  fetchAdminJsonWithRetry('/api/admin/suggestion'),
])
```

All four requests fire simultaneously with the same retry/timeout settings. The result is
cached in `adminJsonCache` keyed by pathname (only applies if using the frontend's
built-in fetch helpers — external agents are not affected).

**Abort-if-health-fails strategy:**

The frontend does not short-circuit on health failure in this parallel load — all four
requests race and `Promise.all` rejects if any fails. For agents that want to fail fast on
worker unavailability, call `/api/admin/health` first (it requires no D1/R2 bindings and
responds immediately), then fire the remaining three in parallel.

---

## 12. Common Error Patterns

Always check **both** `response.status` and `body.status` — the worker uses `200` for all
successful mutations, so a `200` with `body.status === "error"` indicates a write-side
business rule failure.

| Scenario                       | HTTP status | `body.status` | Typical `body.message`                               |
| ------------------------------ | ----------- | ------------- | ---------------------------------------------------- |
| Successful mutation            | `200`       | `"success"`   | Human-readable confirmation                          |
| Validation error (bad input)   | `400`       | `"error"`     | Field-specific message                               |
| Duplicate source image/name    | `400`       | `"error"`     | Legacy R2 collision or D1 unique-name conflict       |
| Commission/character not found | `400`       | `"error"`     | `"Commission not found."` / `"Character not found."` |
| Missing D1 binding             | `503`       | `"error"`     | `"Admin worker DB binding is required..."`           |
| Missing R2 binding             | `503`       | `"error"`     | `"Admin worker IMAGES binding is required..."`       |
| D1 write failed                | `500`       | `"error"`     | `"D1 write operation failed."`                       |
| Route not matched              | `404`       | `"error"`     | `"Not Found"`                                        |
| GitHub rebuild not configured  | `503`       | `"error"`     | `"GITHUB_DISPATCH_TOKEN is not configured..."`       |
| GitHub API non-204             | `502`       | `"error"`     | `"GitHub API returned <status>: <body>"`             |

Note: `updateCommission` (PATCH) returns `200 success` even when nothing changed (the
persistence layer detects no-op and skips the DB write, but the API layer always returns
success).

**Exception:** `GET /api/admin/commissions/:id/source-image` returns plain-text `Not Found`
on 404 — NOT the JSON envelope. Calling `.json()` on this response will throw a parse error.
Use `response.text()` for this endpoint's error case.

---

## 13. Triggering a Rebuild

`POST /api/admin/rebuild` fires a `repository_dispatch` event to GitHub Actions. It is
**fire-and-forget** from the worker's perspective — the worker returns `200` as soon as
GitHub acknowledges the dispatch (HTTP 204 from GitHub), not when the build completes.

Typical build latency: ~2–5 minutes.

```ts
async function triggerRebuild(signal?: AbortSignal) {
  // Replace with production URL or use ADMIN_API_BASE_URL env var
  const response = await fetch('http://127.0.0.1:8787/api/admin/rebuild', {
    method: 'POST',
    signal,
    cache: 'no-store',
  })
  const data = (await response.json()) as { status: string; message: string }
  if (!response.ok) {
    throw new Error(data.message || `Rebuild failed: HTTP ${response.status}`)
  }
  return data
}
```

Requires `GITHUB_DISPATCH_TOKEN` to be configured as a worker secret. Returns `503` if
the token is missing, `502` if GitHub returns a non-204 status.

---

## 14. Dev Environment Quick Start

```bash
# Start the admin frontend (port 4174) and local worker (port 8787)
# Worker connects to remote D1/R2 — there is no mock data layer
pnpm run dev:admin
```

Verify the worker is running:

```bash
curl http://127.0.0.1:8787/api/admin/health
# Expected: {"status":"ok","message":"Admin worker D1/R2 runtime is responding."}
```

**Important:** The local worker connects to the real remote D1/R2 — all reads and writes
hit production data. There is no separate dev database or mock layer. Use a dedicated test
character/commission when experimenting, and clean up afterwards.

Worker port: `8787`. Admin frontend port: `4174`. Astro web (if needed): `4321`.
