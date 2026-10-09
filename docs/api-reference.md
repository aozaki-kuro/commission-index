# Commission Index — Admin API Reference

Endpoint contract for `apps/admin-worker`. Implicit behaviours, footguns, and retry strategy
live in `ai-agent-guide.md`; this file links there instead of repeating them.

**Base URL:** production `https://admin.crystallize.cc`, local dev `http://127.0.0.1:8787`.

## Conventions

**Auth.** `/api/admin/*` is protected by Cloudflare Zero Trust at the network boundary. The
worker performs no token validation. Local dev (direct to `127.0.0.1:8787`) needs no credentials.

**CORS.** `Access-Control-Allow-Origin` is set only when the request `Origin` is same-origin with
the request URL, or its hostname is `localhost`, `*.localhost`, or `127.0.0.1` (any port). Other
origins get no CORS headers. When allowed, responses carry `Access-Control-Allow-Methods:
GET, POST, PUT, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers` (echoes
`Access-Control-Request-Headers`, default `Authorization, Content-Type`), and `Vary: Origin`.
`OPTIONS /api/admin/*` (any path under the prefix) returns `204` with no body.

**Routing.** Paths outside `/api/admin/` are served by the static assets binding. Any
`/api/admin/*` request that matches no route (unknown path, wrong method, non-numeric `:id`) gets
`404` with the JSON envelope `{ "status": "error", "message": "Not Found" }`. Only
`GET /commissions/:id/source-image` uses a plain-text 404 (see its section).

**Response envelope (mutations and errors):**

```text
{ "status": "success" | "error", "message": "string" }
```

Every successful mutation is `200 OK` (no `201`/`204`). `GET` endpoints return their payload
directly. All JSON responses send `Cache-Control: no-store`.

**Status codes.**

| Status | Meaning                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| `400`  | Validation failure, **and** any failure inside a mutation (including D1 errors and missing rows)            |
| `404`  | Unmatched route; unresolved source image                                                                    |
| `500`  | Failure while loading a `GET` payload (bootstrap, aliases, suggestion, character commissions, source image) |
| `502`  | `POST /rebuild` could not reach or was rejected by GitHub                                                   |
| `503`  | Missing `DB` / `IMAGES` binding, or missing `GITHUB_DISPATCH_TOKEN`                                         |

Mutation wrappers convert every thrown error into `400` with the error message (for example a D1
`UNIQUE` violation or `D1 write operation failed.`), so a mutation never returns `500` in practice.
See `ai-agent-guide.md` §8 for what to do with these.

**Binding errors (`503`).** Messages: `Admin worker DB binding is required for this route.`,
`Admin worker IMAGES binding is required for this route.`, or `Admin worker DB and IMAGES bindings
are required for this route.` Each endpoint lists its required bindings. For mutations the binding
check runs after request parsing and field validation, so a bad payload still gets `400` when
bindings are missing.

**Path IDs.** `:id` must be digits to match the route; `0` matches but is rejected with
`400 Invalid character identifier.` / `Invalid commission identifier.`

---

## Health & System

### `GET /api/admin/health`

No bindings required.

```json
{ "status": "ok", "message": "Admin worker D1/R2 runtime is responding." }
```

```bash
curl https://admin.crystallize.cc/api/admin/health
```

### `POST /api/admin/rebuild`

Sends a GitHub `repository_dispatch` (`event_type: "admin-data-changed"`) to trigger a web
rebuild. No request body. Requires the `GITHUB_DISPATCH_TOKEN` worker secret.

**`200`:** `{ "status": "success", "message": "Web rebuild dispatched to GitHub Actions." }` —
returned as soon as GitHub answers `204`, not when the build finishes.

**Errors:** `503` token not configured (`GITHUB_DISPATCH_TOKEN is not configured on the worker.`);
`502` GitHub returned a non-204 status (`GitHub API returned <status>: <body>`); `502` network
failure reaching GitHub.

```bash
curl -X POST https://admin.crystallize.cc/api/admin/rebuild
```

---

## Read Endpoints

All require `DB` unless noted. All can return `500` with `{ "status": "error", "message": ... }`
if the query fails.

### `GET /api/admin/bootstrap`

All characters, a flat commission row list for admin search, and creator alias data.

```typescript
{
  characters: Array<{
    id: number
    name: string
    status: 'active' | 'archived'
    sortOrder: number
    commissionCount: number
  }> // ordered by sortOrder
  creatorAliases: Array<{ creatorName: string; aliases: string[]; commissionCount: number }>
  commissionSearchRows: Array<{
    id: number
    publicId: string
    characterId: number
    characterName: string
    commissionDate: string | null
    creatorName: string | null
    workGroupId: string | null
    partNumber: number | null
    fileName: string // internal asset key; do not parse or use as identity
    links: string // RAW stored JSON string (e.g. '["https://a"]'), not an array
    design: string | null
    description: string | null
    keyword: string | null
    hidden: boolean
  }> // ordered by character sortOrder, commissionDate desc, id desc
}
```

```bash
curl https://admin.crystallize.cc/api/admin/bootstrap
```

### `GET /api/admin/aliases/bootstrap`

Alias data for all three alias types.

```typescript
{
  characterAliases: Array<{ characterName: string; aliases: string[]; commissionCount: number }>
  creatorAliases: Array<{ creatorName: string; aliases: string[]; commissionCount: number }>
  keywordAliases: Array<{ baseKeyword: string; aliases: string[]; commissionCount: number }>
}
```

Each list is sorted by name (`ja` locale collation). To avoid priority conflicts, creator rows
whose normalized key equals a character name, and keyword rows whose key equals a character or
creator name, are dropped (priority: character > creator > keyword). This differs from the
`creatorAliases` returned by `/bootstrap`, which is not filtered.

```bash
curl https://admin.crystallize.cc/api/admin/aliases/bootstrap
```

### `GET /api/admin/suggestion`

```text
{
  featuredKeywords: string[] // saved featured keywords, in order, at most 6
  keywordOptions: string[]   // at most 240 candidates, most frequent first
}
```

`keywordOptions` is derived from commission search metadata (character, creator, keyword terms,
including aliases). Dates are excluded and only a commission's primary creator is counted.

```bash
curl https://admin.crystallize.cc/api/admin/suggestion
```

### `GET /api/admin/characters/:id/commissions`

All commissions of one character (hidden ones included), ordered by `commissionDate` desc, `id` desc.

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
    fileName: string // internal asset key; do not parse or use as identity
    links: string[] // parsed array (contrast with /bootstrap, which returns a raw string)
    design: string | null
    description: string | null
    keyword: string | null
    hidden: boolean
  }>
}
```

**Errors:** `503` missing `DB` (checked first); `400 Invalid character identifier.` for ID `0`.
An unknown character ID yields `{ "commissions": [] }`, not 404.

```bash
curl https://admin.crystallize.cc/api/admin/characters/3/commissions
```

### `GET /api/admin/commissions/:id/source-image`

Streams the source image from R2. Requires `DB` + `IMAGES`.

The object key is resolved from `source_images` by `commission_id`; if no row has that
`commission_id`, it falls back to the row whose `commission_file_name` equals the commission's
internal `file_name` (`COALESCE` in `adminData.ts`). The stored `object_key` is opaque and read
as-is. A commission with no `source_images` row has no image; the bucket is never probed by
file name.

**`200`:** image bytes. `Content-Type` is the R2 object's stored content type, falling back to
`image/png` for a `.png` key and `image/jpeg` otherwise. Also sends `Content-Length` (when known),
`ETag` (when R2 provides one), and `Cache-Control: private, no-cache`.

**`304`:** empty body when `If-None-Match` (comma-separated list or `*`) matches the `ETag`;
`ETag` and `Cache-Control` are still sent. Clients may cache bytes but must revalidate.

**Errors** (checked in this order):

1. `503` — `IMAGES` binding missing (checked before the ID)
2. `400` — ID `0` or not a safe integer (`Invalid commission identifier.`)
3. `503` — `DB` binding missing
4. `404` — **plain-text** `Not Found` (not JSON): unknown commission, no `source_images` row, or
   object missing from R2
5. `500` — JSON envelope, lookup or R2 read failed

```bash
curl -O https://admin.crystallize.cc/api/admin/commissions/12/source-image
```

---

## Character Mutations

All require `DB`. Request bodies are JSON. A body that is not a JSON object is treated as `{}`.

### `POST /api/admin/characters`

```text
{
  name: string                 // required; trimmed; empty -> 400 "Character name is required."
  status?: 'active' | 'archived' // anything other than 'archived' becomes 'active'
}
```

The new character gets `sortOrder = max(sort_order) + 1` regardless of status.

**`200`:** `{ "status": "success", "message": "Character \"Aria\" created." }`

```bash
curl -X POST https://admin.crystallize.cc/api/admin/characters \
  -H 'Content-Type: application/json' \
  -d '{"name":"Aria","status":"active"}'
```

### `PATCH /api/admin/characters/:id`

Same body as `POST`. Both fields are written every time: an omitted or unrecognised `status`
resets the character to `active`. `sortOrder` is not changed.

**`200`:** `{ "status": "success", "message": "Character \"Aria\" updated." }`

**Errors:** `400` ID `0`; `400` empty name; `400 Character not found.`

```bash
curl -X PATCH https://admin.crystallize.cc/api/admin/characters/3 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Aria","status":"archived"}'
```

### `PUT /api/admin/characters/order`

Assigns display order and status from two ID lists.

```text
{
  active: number[]   // ordered IDs to mark 'active'
  archived: number[] // ordered IDs to mark 'archived'
}
```

Semantics:

- Listed IDs get `sort_order` 1..n over `active`, then n+1.. over `archived`, and `status` from the
  list they appear in.
- **Omitted IDs are left untouched** (keep their old `sort_order` and `status`); they are not
  removed. Their old `sort_order` values may collide with the new sequence.
- Both lists empty (or not arrays — non-arrays are coerced to `[]`) is a no-op that still
  returns `200`.
- Entries are mapped with `Number()`. All updates run in one D1 batch.

**`200`:** `{ "status": "success", "message": "Character order updated." }`

**Errors (all `400`):**

- `Invalid character order payload.` — any entry is not a positive safe integer
- `Character order payload contains duplicate identifiers.` — duplicates within or across lists
- `Character order payload must include existing character identifiers only.` — unknown ID
  (nothing is written)

```bash
curl -X PUT https://admin.crystallize.cc/api/admin/characters/order \
  -H 'Content-Type: application/json' \
  -d '{"active":[2,1,3],"archived":[4]}'
```

### `DELETE /api/admin/characters/:id`

Deletes the character **and all of its commissions and their `source_images` rows** in one atomic
D1 batch. R2 image objects are not deleted and become orphans (see
[Source image storage](#source-image-storage)).

**`200`:** `{ "status": "success", "message": "Character deleted." }`

**Errors:** `400` ID `0`; `400 Character not found.`

```bash
curl -X DELETE https://admin.crystallize.cc/api/admin/characters/3
```

---

## Commission Mutations

### Commission fields

| Field                   | Rule                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `characterId`           | Required; finite number > 0; must reference an existing character                                                                                     |
| `commissionDate`        | Required; real calendar date `YYYY-MM-DD`                                                                                                             |
| `creatorName`           | Form: send empty string when unknown. JSON (`PATCH`): required, string or `null`. Trimmed; empty stores `null`; control characters (<= 0x1F) rejected |
| `workGroupId`           | `null`/empty for standalone works, else a lowercase UUID v4 (input is trimmed and lowercased), or the sentinel `new`                                  |
| `partNumber`            | Positive integer; must be set if and only if `workGroupId` is set                                                                                     |
| `links`                 | Newline-separated string; trimmed, blank lines dropped, stored as a JSON array                                                                        |
| `design`, `description` | Trimmed; empty stores `null`                                                                                                                          |
| `keyword`               | Normalized on write (see [Keyword](#keyword)); empty stores `null`                                                                                    |
| `hidden`                | Boolean (see [Hidden](#hidden))                                                                                                                       |

`workGroupId: "new"` (case-insensitive) makes the worker generate a fresh UUID v4 group and is
accepted on both create and `PATCH`. Parts keep separate commission rows, IDs, and images; the
group only expresses grouping and order. `fileName` is never accepted from callers.

Validation errors (`400`): `Character selection is required.`, `Commission date must use
YYYY-MM-DD format.`, `Commission date must be a real calendar date.`, `Creator name must be a
string or null.`, `Work group and part number must be set together.`, `Work group must be a
lowercase UUID v4.`, `Part number must be a positive integer.`

### `POST /api/admin/commissions`

Creates a commission and uploads its source image. `multipart/form-data`. Requires `DB` + `IMAGES`.

```
characterId    string  Number() of this must be valid (see fields table)
commissionDate string  YYYY-MM-DD
creatorName    string  empty string when unknown
workGroupId    string  optional (see fields table)
partNumber     string  optional; required together with workGroupId
links          string  newline-separated URLs
design         string  optional
description    string  optional
keyword        string  optional
hidden         string  "on" hides; anything else / omitted = visible
sourceImage    File    JPEG or PNG, non-empty, with a file name
```

Order of operations: validate fields -> check `sourceImage` -> check bindings -> upload to R2 ->
D1 insert. The worker assigns the internal asset key `commission-<uuid>`; the R2 key is
`source-images/<sha256>-<UUIDv4>.jpg|png` (see [Source image storage](#source-image-storage)).

**`200`:** `{ "status": "success", "message": "Commission dated 2024-03-15 added to Aria." }`

**Errors:**

- `400` — any field validation error above; `Source image is required for new commission entries.`
  (missing, unnamed, or empty file); `Only JPG and PNG uploads are supported.`; `Uploaded image is
empty.`
- `400 Selected character does not exist.` — raised after upload, so the R2 object is orphaned
- `400` — any D1 failure after upload (uniqueness conflict, `D1 write operation failed.`); the
  uploaded object is kept
- `503` — missing `DB` or `IMAGES`

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

### `PATCH /api/admin/commissions/:id`

**Full replace of metadata.** Every field in the table is overwritten; there is no partial update.
Requires `DB`. Does not touch R2 or the image reference; use the source-image endpoint to change
bytes.

```text
{
  characterId: number        // required
  commissionDate: string     // required
  creatorName: string | null // required; string or null (omitted or any other type -> 400)
  workGroupId: string | null // key must be present; null for standalone
  partNumber: number | null  // key must be present; null for standalone
  links?: string             // newline-separated string, NOT an array; omitted -> []
  design?: string            // omitted -> cleared (null)
  description?: string       // omitted -> cleared (null)
  keyword?: string           // omitted -> cleared (null)
  hidden?: boolean           // omitted -> false
}
```

If the new values equal the stored ones, nothing is written and the response is still `200`.

**`200`:** `{ "status": "success", "message": "Commission dated 2024-03-15 updated." }`

**Errors (`400`):** `Invalid commission identifier.` (ID `0`); `workGroupId and partNumber must be
present; use null for standalone commissions.`; field validation errors; `Commission not found.`
(checked before the character); `Selected character does not exist.`; D1 failures.

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

### `DELETE /api/admin/commissions/:id`

Deletes the commission row and its `source_images` row in one atomic D1 batch. The R2 object is
kept (orphan). Requires `DB`.

**`200`:** `{ "status": "success", "message": "Commission deleted." }` — also returned when the
ID does not exist (no-op).

**Errors:** `400 Invalid commission identifier.` (ID `0`).

```bash
curl -X DELETE https://admin.crystallize.cc/api/admin/commissions/12
```

### `POST /api/admin/commissions/:id/source-image`

Replaces the image for an existing commission. `multipart/form-data` with one field
`sourceImage` (JPEG/PNG, non-empty, named). Requires `DB` + `IMAGES`.

Writes a new `source-images/<sha256>-<UUIDv4>.jpg|png` object, upserts the `source_images` row
(keeping the commission's internal asset key; creates the row if missing), then deletes the
previous object on a best-effort basis.

**`200`:** `{ "status": "success", "message": "Source image for commission 12 replaced." }`

**Errors:**

- `400 Invalid commission identifier.` (ID `0`); `400 Source image is required.`; `400 Commission
not found.`; `400 Only JPG and PNG uploads are supported.`
- `400` — D1 update failed: the previous image stays active and the newly uploaded object is orphaned
- `503` — missing `DB` or `IMAGES`

If deleting the previous object fails after the D1 update, the request still returns `200` and
the old object is an orphan.

```bash
curl -X POST https://admin.crystallize.cc/api/admin/commissions/12/source-image \
  -F 'sourceImage=@/path/to/new-image.png;type=image/png'
```

---

## Alias Mutations

All four endpoints require `DB` and a JSON body. Malformed JSON is caught here and returned as
`400`.

**Alias row semantics** (the three `*/batch` endpoints):

- **Upsert per row; not a full replace.** For each submitted row: non-empty aliases are
  upserted by name, an empty alias list **deletes** that name's record. Names not in the request
  are untouched. Everything is applied in one atomic batch. An empty `rows` is a successful no-op.
- Rows in one request with the same normalized name are merged (aliases unioned) first; rows with an
  empty name are skipped.
- `aliases` may be `string[]` or a single string split on `, \n ， 、 ; ；`. A row's singular `alias`
  string is an undocumented fallback used only when `aliases` is absent. Array elements are not split.
- `rows` must be an array to be used directly; otherwise the worker parses `rowsJson` (or, if
  absent, the `rows` value) with `JSON.parse(String(...))`. Use `rowsJson` only for clients that
  cannot send nested JSON.
- Normalization per type:

| Type      | Name key                                               | Alias normalization                                                |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| creator   | trimmed, trailing ` (part N)` stripped; case-sensitive | trim, drop empty, case-sensitive dedupe                            |
| character | trim, collapse spaces, case-insensitive                | trim, collapse spaces, case-insensitive dedupe (first casing kept) |
| keyword   | trim, collapse spaces, case-insensitive                | same as character                                                  |

**`200` messages:** `Creator aliases saved.`, `Character aliases saved.`, `Keyword aliases saved.`

### `POST /api/admin/aliases/batch`

Row shape: `{ creatorName: string, aliases: string[] | string }`.

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

### `POST /api/admin/character-aliases/batch`

Row shape: `{ characterName: string, aliases: string[] | string }`.

```bash
curl -X POST https://admin.crystallize.cc/api/admin/character-aliases/batch \
  -H 'Content-Type: application/json' \
  -d '{"rows": [{"characterName": "Aria", "aliases": ["アリア", "Aria-chan"]}]}'
```

### `POST /api/admin/keyword-aliases/batch`

Row shape: `{ baseKeyword: string, aliases: string[] | string }`. Aliases let alternate terms
resolve to the canonical keyword in search.

```bash
curl -X POST https://admin.crystallize.cc/api/admin/keyword-aliases/batch \
  -H 'Content-Type: application/json' \
  -d '{"rows": [{"baseKeyword": "casual", "aliases": ["カジュアル", "everyday"]}]}'
```

### `POST /api/admin/suggestion`

**Full replace** of the home page featured keywords.

```text
{
  keywords: string[]    // ordered
  keywordsJson?: string // JSON-string fallback, same rule as rowsJson
}
```

Each keyword is converted with `String()`, whitespace-collapsed, empty values dropped, deduped
case-insensitively (first wins), then the first 6 unique keywords are kept. An empty list clears
the featured keywords.

**`200`:** `{ "status": "success", "message": "Home featured keywords saved." }`

```bash
curl -X POST https://admin.crystallize.cc/api/admin/suggestion \
  -H 'Content-Type: application/json' \
  -d '{"keywords": ["casual", "summer", "winter", "fantasy"]}'
```

---

## Field Reference

### Commission identity

- `id` is the internal integer key for the admin API and joins.
- `publicId` is an immutable lowercase UUID v4 per commission; public anchors, RSS, and search use
  it.
- `commissionDate` and `creatorName` are explicit fields, independent of any file name.
  `creatorName` is `null` when unknown (the public site renders `Anon` without storing it).
- `fileName` (returned by two read endpoints) is an internal asset key. Callers must not send
  it, parse it, derive identity from it, or build image URLs from it. New commissions get
  `commission-<uuid>`.

### `links`

| Where                                           | Format                                     |
| ----------------------------------------------- | ------------------------------------------ |
| `POST /commissions` (FormData), `PATCH` (JSON)  | newline-separated string, one URL per line |
| `GET /characters/:id/commissions`               | `string[]`                                 |
| `GET /bootstrap` `commissionSearchRows[].links` | raw JSON string of the array               |

### `keyword`

Normalized on write for create and `PATCH`: split on `, \n ， 、 ; ；`, trimmed with internal
whitespace collapsed, empty terms dropped, case-insensitive dedupe (first casing wins), joined
with `", "`. `"Full Body,  nsfw , solo, full body"` is stored as `"Full Body, nsfw, solo"`. If no
terms remain, `null` is stored. No alias-map lookup takes place. Reads return the stored string;
split it on `,`.

### `hidden`

| Where                          | Encoding                                               |
| ------------------------------ | ------------------------------------------------------ |
| `POST /commissions` (FormData) | `"on"` hides; omitted or any other value = visible     |
| `PATCH` (JSON)                 | JSON value coerced with `Boolean()`; omitted = `false` |
| Read responses                 | `boolean`                                              |

### Source image formats

Accepted by `POST /commissions` and `POST /commissions/:id/source-image`: the file must be
non-empty and have a non-empty name. The type is `image/jpeg` -> `.jpg` or `image/png` -> `.png`
by `Content-Type`; only when `Content-Type` is neither, the file extension (`.jpg`/`.jpeg`/`.png`)
decides. Anything else (including WebP) is rejected with `Only JPG and PNG uploads are
supported.` The stored content type is derived from the resolved extension.

### Source image storage

- New uploads (create and replace) write `source-images/<sha256>-<UUIDv4>.jpg|png`, with a fresh
  UUID for every upload, including identical bytes. The key contains no date, creator, or
  commission name.
- The D1 `source_images.object_key` is opaque identity. Reads use it as stored; historical keys
  are read as-is. Do not infer keys from file names.
- R2 and D1 share no transaction. Failures after upload (create or replace) leave an orphaned
  object; deleting a commission or character, or replacing an image whose cleanup fails, also leaves
  orphans. Cleanup procedure: `ai-agent-guide.md` §7.
