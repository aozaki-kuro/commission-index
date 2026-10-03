# Commission Index — Admin API Reference

**Base URL (production):** `https://admin.crystallize.cc`
**Base URL (local dev):** `http://127.0.0.1:8787`

**Auth:** All `/api/admin/*` endpoints are protected by Cloudflare Zero Trust at the network
boundary. The worker itself performs no token validation — authenticated sessions pass through
transparently. In local dev, CORS allows any `*.localhost` or `127.0.0.1:*` origin. No
credentials are required when calling the worker directly at `127.0.0.1:8787` in local dev —
Zero Trust is only enforced in production.

**Response envelope (mutations):**

```json
{ "status": "success" | "error", "message": "string" }
```

**HTTP status on success:** All successful responses use `200 OK` regardless of HTTP method
(no `201`/`204`).

**Error format:** HTTP 400/404/500/503 + `{ "status": "error", "message": "..." }`.

**Binding errors (503):** Returned when the D1 (`DB`) or R2 (`IMAGES`) Cloudflare binding is
missing. Each endpoint notes which bindings it requires.

---

## Health & System

### `GET /api/admin/health`

Confirms the worker is running. Does not require any bindings.

**Response `200`:**

```json
{ "status": "ok", "message": "Admin worker D1/R2 runtime is responding." }
```

```bash
curl https://admin.crystallize.cc/api/admin/health
```

---

### `POST /api/admin/rebuild`

Dispatches a `repository_dispatch` event to GitHub Actions to trigger a web rebuild.
Requires the `GITHUB_DISPATCH_TOKEN` environment variable to be set on the worker.

**Request:** No body.

**Response `200`:**

```json
{ "status": "success", "message": "Web rebuild dispatched to GitHub Actions." }
```

**Errors:**

- `503` — `GITHUB_DISPATCH_TOKEN` not configured
- `502` — GitHub API returned a non-204 status
- `502` — network error reaching GitHub API (fetch failed or timed out)

```bash
curl -X POST https://admin.crystallize.cc/api/admin/rebuild
```

---

## Bootstrap / Read Endpoints

### `GET /api/admin/bootstrap`

Loads the full admin bootstrap payload: all characters, their commission search rows, and
creator alias data. Used by the admin UI on initial load.

**Requires:** `DB`

**Response `200`:**

```typescript
{
  characters: Array<{
    id: number
    name: string
    status: 'active' | 'archived'
    sortOrder: number
    commissionCount: number
  }>
  creatorAliases: Array<{
    creatorName: string
    aliases: string[]
    commissionCount: number
  }>
  commissionSearchRows: Array<{
    id: number
    publicId: string
    characterId: number
    characterName: string
    commissionDate: string | null
    creatorName: string | null
    workGroupId: string | null
    partNumber: number | null
    design: string | null
    description: string | null
    keyword: string | null
  }>
}
```

```bash
curl https://admin.crystallize.cc/api/admin/bootstrap
```

---

### `GET /api/admin/aliases/bootstrap`

Loads alias data for all three alias types: characters, creators, and keywords. Used by the
aliases admin page.

**Requires:** `DB`

**Response `200`:**

```typescript
{
  characterAliases: Array<{
    characterName: string
    aliases: string[]
    commissionCount: number
  }>
  creatorAliases: Array<{
    creatorName: string
    aliases: string[]
    commissionCount: number
  }>
  keywordAliases: Array<{
    baseKeyword: string
    aliases: string[]
    commissionCount: number
  }>
}
```

Note: Creator and keyword alias rows are deduplicated against character aliases by normalized
key to avoid priority conflicts.

```bash
curl https://admin.crystallize.cc/api/admin/aliases/bootstrap
```

---

### `GET /api/admin/suggestion`

Loads the home search suggestion admin data: the current featured keywords list (up to 6)
and a pool of up to 240 popular keyword options derived from commission metadata.

**Requires:** `DB`

**Response `200`:**

```typescript
{
  featuredKeywords: string[]   // up to 6, from home_featured_search_keywords table
  keywordOptions: string[]     // up to 240, ranked by frequency across all commissions
}
```

```bash
curl https://admin.crystallize.cc/api/admin/suggestion
```

---

### `GET /api/admin/characters/:id/commissions`

Returns all commissions belonging to a specific character, including full detail (links,
hidden flag).

**Requires:** `DB`

**Path param:** `:id` — numeric character ID (positive integer)

**Response `200`:**

```typescript
{
  commissions: Array<{
    id: number
    publicId: string
    characterId: number
    characterName: string
    commissionDate: string | null
    creatorName: string | null
    workGroupId: string | null
    partNumber: number | null
    links: string[]
    design: string | null
    description: string | null
    keyword: string | null
    hidden: boolean
  }>
}
```

**Errors:**

- `400` — invalid (non-numeric or non-positive) character ID
- `503` — D1 binding not available

Note: Returns `{ "commissions": [] }` when no matching character or commissions exist — no 404
is returned for a valid but non-existent character ID.

```bash
curl https://admin.crystallize.cc/api/admin/characters/3/commissions
```

---

### `GET /api/admin/commissions/:id/source-image`

Fetches the source image from R2 by stable commission ID. The Worker resolves the immutable
object key through the commission's `source_images` metadata; there is no filename-based
fallback. The stored key is read opaquely, including historical root keys, historical
commission-folder keys, and the current flat keys under `source-images/`. Dates, creator
names, and legacy file names are not part of the image URL.

**Requires:** `DB` + `IMAGES`

**Path param:** `:id` — numeric commission ID (positive integer)

**Response `200`:** Raw image binary with `Content-Type: image/jpeg` or `image/png`, an `ETag`
derived from the R2 object, and `Cache-Control: private, no-cache`.

**Response `304`:** Empty body when the request `If-None-Match` matches the object's `ETag`; still
returns `ETag` and `Cache-Control: private, no-cache`. Clients may cache the bytes but must
revalidate, so a replaced image is never served stale.

**Errors:**

- `400` — invalid commission ID
- `404` — unknown commission, no `source_images` metadata for it, or the referenced object is
  missing from R2 (**plain-text** `Not Found`, not the JSON error envelope)
- `503` — D1 or R2 binding not available

```bash
curl -O https://admin.crystallize.cc/api/admin/commissions/12/source-image
```

---

## Character Mutations

### `POST /api/admin/characters`

Creates a new character.

**Requires:** `DB`

**Request body (JSON):**

```typescript
{
  name: string // required, non-empty after trim
  status: 'active' | 'archived' // defaults to 'active' if not 'archived'
}
```

**Response `200`:**

```json
{ "status": "success", "message": "Character \"Name\" created." }
```

**Errors:**

- `400` — missing or empty name

```bash
curl -X POST https://admin.crystallize.cc/api/admin/characters \
  -H 'Content-Type: application/json' \
  -d '{"name":"Aria","status":"active"}'
```

---

### `PATCH /api/admin/characters/:id`

Updates an existing character's name and/or status.

**Requires:** `DB`

**Path param:** `:id` — numeric character ID

**Request body (JSON):**

```typescript
{
  name: string // required, non-empty after trim
  status: 'active' | 'archived'
}
```

**Response `200`:**

```json
{ "status": "success", "message": "Character \"Name\" updated." }
```

**Errors:**

- `400` — invalid ID or empty name
- `400` — character ID not found in D1 (`"Character not found."`)

```bash
curl -X PATCH https://admin.crystallize.cc/api/admin/characters/3 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Aria","status":"archived"}'
```

---

### `PUT /api/admin/characters/order`

Replaces the full sort order for all characters. Both lists must together enumerate every
character ID — omitting an ID removes it from the sort order.

**Requires:** `DB`

**Request body (JSON):**

```typescript
{
  active: number[]    // ordered IDs for active characters
  archived: number[]  // ordered IDs for archived characters
}
```

**Response `200`:**

```json
{ "status": "success", "message": "Character order updated." }
```

**Errors / coercion behavior:**

- Non-array `active`/`archived` fields are coerced to empty arrays — no validation error is
  returned for missing or non-array values.
- Every entry must be a positive safe integer. Duplicate IDs across either list cause `400`.
- Every submitted ID must exist; unknown IDs cause `400` and no order update is issued.
- Active and archived changes are committed together in one D1 batch.

```bash
curl -X PUT https://admin.crystallize.cc/api/admin/characters/order \
  -H 'Content-Type: application/json' \
  -d '{"active":[2,1,3],"archived":[4]}'
```

---

### `DELETE /api/admin/characters/:id`

Deletes a character by ID.

**Requires:** `DB`

**Path param:** `:id` — numeric character ID

**Response `200`:**

```json
{ "status": "success", "message": "Character deleted." }
```

**Errors:**

- `400` — invalid ID
- `400` — character ID not found in D1 (`"Character not found."`)

```bash
curl -X DELETE https://admin.crystallize.cc/api/admin/characters/3
```

---

## Commission Mutations

### `POST /api/admin/commissions`

Creates a new commission and uploads its source image to R2. The request must be
`multipart/form-data`. This is the only endpoint that accepts a file upload for creation.
New objects use `source-images/<sha256>-<UUIDv4>.jpg` or `.png`, with a fresh UUID for each
upload, including identical bytes. The internal commission filename is still validated and
persisted in D1; it is not part of the new R2 key.

**Requires:** `DB` + `IMAGES`

**Request body (FormData):**

```
characterId    string   Numeric character ID (parsed via Number())
commissionDate string   Required real calendar date in YYYY-MM-DD format
creatorName    string   Creator display name; submit an empty string when unknown
workGroupId    string   Optional UUID v4 for a multi-part work group; trimmed and normalized to lowercase
partNumber     string   Positive integer; required together with workGroupId
links          string   Newline-separated URL list (one URL per line)
design         string   Optional design label
description    string   Optional description text
keyword        string   Optional comma-separated keyword terms
hidden         string   Send "on" to mark as hidden; omit or any other value = not hidden
sourceImage    File     JPEG or PNG only; determined by Content-Type (image/jpeg / image/png)
                        or by file extension (.jpg / .jpeg / .png). Must be non-empty.
```

**Response `200`:**

```json
{ "status": "success", "message": "Commission dated 2024-03-15 added to Aria." }
```

**Errors:**

- `400` — missing/invalid `characterId` or `commissionDate`, missing `sourceImage`
- `400` — malformed `workGroupId`, non-positive/non-integer `partNumber`, or only one part field set
- `400` — invalid image type or a D1 uniqueness conflict (R2 is not probed before upload)
- `503` — missing `DB` or `IMAGES` binding

Empty or whitespace-only `workGroupId` and `partNumber` values are normalized to `null` before
validation. Submit both as empty values (FormData) for a standalone work; submit both values for
a grouped part.

```bash
curl -X POST https://admin.crystallize.cc/api/admin/commissions \
  -F 'characterId=3' \
  -F 'commissionDate=2024-03-15' \
  -F 'creatorName=creator' \
  -F 'links=https://example.com/art1' \
  -F 'design=Casual' \
  -F 'description=Summer outfit' \
  -F 'keyword=casual,summer' \
  -F 'sourceImage=@/path/to/image.jpg;type=image/jpeg'
  # To hide from public site: add -F 'hidden=on'
```

---

### `PATCH /api/admin/commissions/:id`

Updates commission metadata by stable ID. `commissionDate` and `creatorName` are explicit
business fields; the internal legacy `fileName` is not accepted as an editable field. Changing
date or creator does not rename, copy, move, or delete the R2 object. Use the dedicated
source-image endpoint to replace image bytes.

**Requires:** `DB`

**Path param:** `:id` — numeric commission ID

**Request body (JSON):**

```typescript
{
  characterId: number    // target character ID
  commissionDate: string // required real calendar date in YYYY-MM-DD format
  creatorName: string | null // creator display name, or null when unknown
  workGroupId: string | null // optional UUID v4, normalized to lowercase; identifies a multi-part work group
  partNumber: number | null  // positive integer; both part fields must be set together
  links: string          // newline-separated URL list (one URL per line)
  design?: string        // optional
  description?: string   // optional
  keyword?: string       // optional comma-separated keyword terms
  hidden: boolean        // true to hide from public site
}
```

Note: `commissionDate`, `creatorName`, `workGroupId`, and `partNumber` must be present on every
PATCH; use `null` or empty strings for both part fields on a standalone work. Empty strings are
normalized to `null` before validation. Both fields must otherwise be set: `workGroupId` is a UUID
v4 (normalized to lowercase) and `partNumber` is a positive integer. Parts retain separate commission
rows, IDs, and source images. `links` is a
newline-separated `string` here (same as FormData), not an array.
The worker parses it with the same line-splitting logic as the create endpoint.

**Response `200`:**

```json
{ "status": "success", "message": "Commission dated 2024-03-15 updated." }
```

**Errors:**

- `400` — invalid ID, missing/invalid `characterId` or `commissionDate`
- `400` — `creatorName` must be a string or `null`
- `400` — malformed `workGroupId`, non-positive/non-integer `partNumber`, or only one part field set

```bash
curl -X PATCH https://admin.crystallize.cc/api/admin/commissions/12 \
  -H 'Content-Type: application/json' \
  -d '{
    "characterId": 3,
    "commissionDate": "2024-03-15",
    "creatorName": "creator",
    "workGroupId": null,
    "partNumber": null,
    "links": "https://example.com/art1\nhttps://example.com/art2",
    "design": "Casual",
    "description": "Summer outfit",
    "keyword": "casual,summer",
    "hidden": false
  }'
```

---

### `DELETE /api/admin/commissions/:id`

Deletes a commission record and its source-image metadata from D1 in one atomic batch. The
source image remains in R2 for later orphan cleanup. Before cleanup, compare the actual bucket
inventory with fresh D1 references and confirm the backup and retention policy permit deletion.
The completed source-image migration's old root and commission-folder objects were removed on
2026-10-03; restoring an old mapping now requires re-uploading its bytes from local backup first.

**Requires:** `DB`

**Path param:** `:id` — numeric commission ID

**Response `200`:**

```json
{ "status": "success", "message": "Commission deleted." }
```

**Errors:**

- `400` — invalid ID

```bash
curl -X DELETE https://admin.crystallize.cc/api/admin/commissions/12
```

---

### `POST /api/admin/commissions/:id/source-image`

Replaces the source image for an existing commission addressed by stable ID. Writes a fresh
`source-images/<sha256>-<UUIDv4>.jpg` or `.png` object and updates the D1 image reference,
retaining the commission filename metadata. Changing `commissionDate` or
`creatorName` through PATCH does not invoke this endpoint or alter the R2 object.

**Requires:** `DB` + `IMAGES`

**Path param:** `:id` — numeric commission ID

**Request body (FormData):**

```
sourceImage          File     JPEG or PNG only (same rules as POST /commissions)
```

**Response `200`:**

```json
{ "status": "success", "message": "Source image for commission 12 replaced." }
```

**Errors:**

- `400` — invalid ID or missing/invalid `sourceImage`
- `503` — missing `DB` or `IMAGES` binding

If the D1 metadata update fails, the previous image remains active; the newly uploaded object
may remain orphaned for later cleanup. If cleanup of the previous object fails after the D1
commit, the new image remains active and the old object is an orphan. Cleanup still requires a
fresh D1 reference check and confirmation that backup and retention requirements are satisfied;
an unreferenced object is not automatically eligible for deletion.

```bash
curl -X POST https://admin.crystallize.cc/api/admin/commissions/12/source-image \
  -F 'sourceImage=@/path/to/new-image.png;type=image/png'
```

---

## Alias Mutations

### `POST /api/admin/aliases/batch`

Replaces all creator alias records in bulk. Each row maps a canonical creator name to its
aliases.

**Requires:** `DB`

**Request body (JSON):**

```typescript
{
  rows: Array<{
    creatorName: string
    aliases: string[] | string  // array preferred; single string also accepted
  }>
  // Alternative: pass rows as a JSON-encoded string in rowsJson if rows is absent
  rowsJson?: string
}
```

Note: Each row also accepts a singular `alias` string field as an undocumented fallback
(`aliases` takes precedence when both are present).

Note: When both `rows` and `rowsJson` are present, `rows` takes precedence. Use `rowsJson`
only when your HTTP client cannot send a JSON body (e.g., plain form posts).

**Response `200`:**

```json
{ "status": "success", "message": "Creator aliases saved." }
```

```bash
curl -X POST https://admin.crystallize.cc/api/admin/aliases/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "rows": [
      {"creatorName": "creator_handle", "aliases": ["Creator Handle", "creator"]},
      {"creatorName": "another_creator", "aliases": []}
    ]
  }'
```

---

### `POST /api/admin/character-aliases/batch`

Replaces all character alias records in bulk.

**Requires:** `DB`

**Request body (JSON):**

```typescript
{
  rows: Array<{
    characterName: string
    aliases: string[] | string
  }>
  rowsJson?: string  // JSON-encoded string fallback for rows
}
```

Note: Each row also accepts a singular `alias` string field as an undocumented fallback
(`aliases` takes precedence when both are present).

Note: When both `rows` and `rowsJson` are present, `rows` takes precedence. Use `rowsJson`
only when your HTTP client cannot send a JSON body (e.g., plain form posts).

**Response `200`:**

```json
{ "status": "success", "message": "Character aliases saved." }
```

```bash
curl -X POST https://admin.crystallize.cc/api/admin/character-aliases/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "rows": [
      {"characterName": "Aria", "aliases": ["アリア", "Aria-chan"]}
    ]
  }'
```

---

### `POST /api/admin/keyword-aliases/batch`

Replaces all keyword alias records in bulk. Keyword aliases allow alternate terms to resolve
to a canonical keyword during search.

**Requires:** `DB`

**Request body (JSON):**

```typescript
{
  rows: Array<{
    baseKeyword: string
    aliases: string[] | string
  }>
  rowsJson?: string  // JSON-encoded string fallback for rows
}
```

Note: Each row also accepts a singular `alias` string field as an undocumented fallback
(`aliases` takes precedence when both are present).

Note: When both `rows` and `rowsJson` are present, `rows` takes precedence. Use `rowsJson`
only when your HTTP client cannot send a JSON body (e.g., plain form posts).

**Response `200`:**

```json
{ "status": "success", "message": "Keyword aliases saved." }
```

```bash
curl -X POST https://admin.crystallize.cc/api/admin/keyword-aliases/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "rows": [
      {"baseKeyword": "casual", "aliases": ["カジュアル", "everyday"]}
    ]
  }'
```

---

### `POST /api/admin/suggestion`

Replaces the home page featured search keywords. Accepts an ordered list of up to 6
keywords. Excess entries beyond 6 are silently discarded.

**Requires:** `DB`

**Request body (JSON):**

```typescript
{
  keywords: string[]   // ordered list of featured keywords (max 6 used)
  keywordsJson?: string  // JSON-encoded string fallback for keywords
}
```

Note: When both `keywords` and `keywordsJson` are present, `keywords` takes precedence. Use
`keywordsJson` only when your HTTP client cannot send a JSON body (e.g., plain form posts).

**Response `200`:**

```json
{ "status": "success", "message": "Home featured keywords saved." }
```

```bash
curl -X POST https://admin.crystallize.cc/api/admin/suggestion \
  -H 'Content-Type: application/json' \
  -d '{"keywords": ["casual", "summer", "winter", "fantasy"]}'
```

---

## Field Reference

### Commission identity and part fields

- `id` is the internal integer key used by the authenticated Admin API and relational joins.
- `publicId` is an immutable lowercase UUID v4, unique per commission row. Public page anchors,
  RSS identities, and search output use it so external identity does not expose insertion order.
- `commissionDate` is an explicit `YYYY-MM-DD` calendar date. Invalid calendar dates are
  rejected; it is independent of the legacy file name.
- `creatorName` is a display name or `null` when unknown; presentation layers render unknown as
  `Anon` without storing that label as a creator.
- `workGroupId` and positive `partNumber` are either both set or both `null`. Every part remains
  its own commission row, UUID, content, and image. They only express grouping and order.
- The legacy `fileName` remains an internal compatibility/migration field. Callers must not
  send it, derive identity from it, or use it to construct source-image URLs.

### Commission `links` encoding

| Endpoint                                  | Format                                     |
| ----------------------------------------- | ------------------------------------------ |
| `POST /api/admin/commissions` (FormData)  | Newline-separated string; one URL per line |
| `PATCH /api/admin/commissions/:id` (JSON) | Newline-separated string; one URL per line |
| Read responses (`GET …/commissions`)      | `string[]` (parsed array)                  |

### Commission `keyword`

Comma-separated keyword string (e.g. `"casual,summer,outdoor"`). The worker stores this
as-is; term splitting occurs at query/export time via `splitKeywordTerms`.

### Commission `hidden`

| Endpoint                                  | Encoding                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/admin/commissions` (FormData)  | Send field value `"on"` to hide; omit or send anything else = not hidden |
| `PATCH /api/admin/commissions/:id` (JSON) | `boolean` (`true` / `false`)                                             |
| Read responses                            | `boolean`                                                                |

### Source image formats

Accepted by `POST /api/admin/commissions` and `POST /api/admin/commissions/:id/source-image`:

- JPEG: `Content-Type: image/jpeg` OR file extension `.jpg` / `.jpeg`
- PNG: `Content-Type: image/png` OR file extension `.png`

Content-Type takes precedence over file extension. WebP is not supported.
