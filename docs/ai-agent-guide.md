# Commission Index — AI Agent Integration Guide

Non-obvious behaviour, footguns, and retry strategy for the admin API. Endpoint contracts
(paths, bodies, status codes, `curl` examples) live in `api-reference.md` (AR); this file does not
repeat them. Read both before writing automation.

---

## 1. Environment

- The frontend resolves its base URL in `getAdminApiBaseUrl()`: `ADMIN_API_BASE_URL` if set, else
  `http://127.0.0.1:8787` in dev, else same-origin. Production is behind Zero Trust, so external
  scripts must present an Access token.
- The local worker (`pnpm run dev:admin`) talks to the **real remote D1/R2**. There is no mock or
  dev database; use a dedicated test character and clean up afterwards.

---

## 2. Retry Strategy

`fetchAdminJsonWithRetry` (frontend, **GET only**) makes up to 4 attempts with a linear backoff of
250 ms x attempt number (250, 500, 750 ms before attempts 2-4) and an 8 000 ms per-request abort.
Any non-ok response, 4xx included, throws and is retried.

- Reads: retrying is safe. Do not retry 4xx on principle; they will not change.
- **Mutations: single attempt only.** The frontend sends them with plain `fetch`. Retrying
  `POST /commissions` re-uploads the image and creates another orphaned object, and a lost response
  may hide a committed write. After an ambiguous failure, re-read the data (§8) before deciding.
- `POST /rebuild` is also single attempt (the frontend uses a plain `fetch`).

---

## 3. Commission Identity and `fileName`

- Identity is the numeric `id` (admin API) or `publicId` (public site). `commissionDate` and
  `creatorName` are explicit fields; editing them never renames, moves, or deletes an R2 object.
- `fileName` (in bootstrap rows and character commission rows) is an internal asset key, assigned
  by the worker as `commission-<uuid>` on create. Never send it, parse it, or build URLs from it.
- The only validation applied to the asset key (`getSourceImageFileNameValidationError`): non-empty,
  at most 180 characters, no `/`, `\`, `..`, or control characters. Legacy file-name conventions
  (`YYYYMMDD_creator`, CJK handling, forbidden-character lists) are **not enforced** and must not
  be used to derive date, creator, or identity.
- `GET .../source-image` resolves by commission `id` through `source_images.commission_id`, and
  falls back to `source_images.commission_file_name = commissions.file_name`. A missing row means
  no image (404); nothing is probed in the bucket.

---

## 4. Serialization Quirks

**`links`.** Writes take a newline-separated **string**; the worker splits, trims, drops blanks, and
stores a JSON array. Do not send an array to `PATCH`: the worker applies `String()`, so
`["a","b"]` becomes the single link `"a,b"`. Reads differ by endpoint: `GET /bootstrap` returns the
**raw stored JSON string** in `commissionSearchRows[].links` (you must `JSON.parse` it), while
`GET /characters/:id/commissions` returns a parsed `string[]`.

**`hidden`.** `PATCH` coerces with `Boolean()`, so the string `"false"` or `"0"` becomes `true`.
Send a real boolean. FormData hides only on the exact value `"on"`.

**`keyword`.** Normalized on every create/`PATCH` write (rules in AR "Field Reference"). It does not
consult the keyword alias table: `normalizeKeywordAliases` in `packages/domain` only splits, trims,
collapses whitespace, and dedupes case-insensitively. When parsing a returned `keyword`, split on
`,` only; the wider separator set is for input.

**`PATCH /commissions/:id` is a full replace.** Omitting `design`, `description`, `keyword`, or
`links` clears them, and omitting `hidden` sets `false`. `creatorName`, `workGroupId`, and
`partNumber` keys must be present (use `null`). Always read-modify-write from the current row.
Work groups: `workGroupId: "new"` creates a fresh group; sending it again on a later `PATCH` of an
already-grouped part moves that part to yet another new group, so reuse the existing UUID to keep it.

**Unhandled bad bodies.** Mutation routes outside the alias/suggestion batches parse the body
outside any `try`. Malformed JSON or a non-multipart upload throws out of the worker handler
instead of returning the JSON envelope (inferred from reading `adminApi.ts`; not exercised
against a live worker). Always send well-formed bodies with the right content type.

---

## 5. Alias Batches

**Alias batch endpoints are upsert-per-row, not "replace all".** (Contract: AR "Alias Mutations".)

- To delete an entry you must send it with empty `aliases` (`[]` or `""`). Omitting it leaves it
  intact. Partial submissions are safe: only send changed rows.
- A deletion row for a name that never existed is a harmless no-op.
- Use the right endpoint per type: `/aliases/batch` (creators), `/character-aliases/batch`,
  `/keyword-aliases/batch`. The row key differs (`creatorName`, `characterName`, `baseKeyword`).
- Matching is by normalized name, and the three types normalize differently (AR table). Creator
  aliases dedupe case-sensitively; character and keyword aliases dedupe case-insensitively and keep
  the first casing. Example: keyword aliases `"full body, FullBody , full body"` are stored as
  `["full body", "FullBody"]`; `baseKeyword` `"Full Body"` and `"full body"` address the same row.
- `GET /aliases/bootstrap` hides creator/keyword rows that collide with a higher-priority name, so a
  name you just saved under one type may not show up in that list.
- `POST /suggestion` is the opposite: it is a **full replace** of the featured list (empty list
  clears it, duplicates are dropped before the cap of 6).

---

## 6. Character Order and Status

- `PUT /characters/order` only touches the IDs you send: it writes `sort_order` 1..n (active first,
  then archived continuing) and the status implied by the list. **Omitted characters keep their old
  `sort_order` and `status`**, so a partial list can produce duplicate or interleaved orders.
  Always send every character (read `/bootstrap`, split by status, sort by `sortOrder`, move IDs,
  PUT both full lists).
- Empty lists, or non-array fields (silently coerced to `[]`), are a successful no-op, so a typo in
  a key name looks like success.
- `POST` / `PATCH /characters` coerce `status`: anything other than the string `"archived"` becomes
  `"active"`, so omitting `status` on `PATCH` un-archives the character.
- `sortOrder` set by `PATCH` is unchanged; new characters go to the end (`max + 1`).

---

## 7. Images and R2

R2 and D1 have no shared transaction, and the API never deletes R2 objects. (Key format and image
rules: AR "Source image storage".)

| Operation                              | D1 result                                                            | R2 result                                  |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| `POST /commissions` succeeds           | rows inserted                                                        | new object                                 |
| `POST /commissions`, D1 step fails     | nothing (or ambiguous)                                               | uploaded object **kept** (orphan or live)  |
| `POST .../source-image` succeeds       | `object_key` switched                                                | new object; previous deleted best effort   |
| `POST .../source-image`, D1 step fails | unchanged, old image still live                                      | new object is an orphan; response is `400` |
| `DELETE /commissions/:id`              | commission + image row removed                                       | object orphaned                            |
| `DELETE /characters/:id`               | **character, all its commissions, and all their image rows removed** | **all their objects orphaned**             |

**Footgun: `DELETE /characters/:id` cascades** to every commission and `source_images` row of that
character in one atomic batch. There is no confirmation and no undo; the objects remain in R2 but
are unreachable. Read `GET /characters/:id/commissions` first and confirm intent. `DELETE
/commissions/:id` on an unknown ID returns `200` and does nothing, so a success message does not
prove a row existed.

**Cleaning up orphans is a manual operator task.** Before deleting any object: list the actual
bucket inventory, read fresh D1 `source_images.object_key` references, and confirm the backup and
retention policy. Never delete based on a single stale export snapshot, and never delete after an
ambiguous create until the D1 state is verified. The legacy root and commission-folder R2 layouts
were deleted and the migration tooling and backups removed; that is **not rollbackable**. Do not
assume any key layout: `object_key` is opaque, and historical keys are simply read as stored.

---

## 8. Errors and Partial Failures

(Status codes and message catalogue: AR "Conventions" and each endpoint.)

- Check `response.status` first, then `body.status`. A `200` is always `"success"`; there is no
  `200` with `"status": "error"`.
- **Mutation failures are `400`, not `500`.** Every thrown error (validation, missing row, D1
  constraint, `D1 write operation failed.`) is wrapped into `400` with the raw message, so `400`
  does not imply a client mistake: a D1 outage also surfaces as `400`. `500` only comes from
  `GET` payload loaders.
- `503` means a missing binding (or rebuild token) and will not heal on retry.
- Missing-row cases return `400` (`Character not found.`, `Commission not found.`), except
  `DELETE /commissions/:id` (200 no-op) and `GET /characters/:id/commissions` (`200` with an empty
  list for an unknown character; check `/bootstrap` first if you need to tell the cases apart).
- `GET .../source-image` returns **plain text** `Not Found` on 404. Call `.text()`, not `.json()`.
  Its error `500` and `503` are JSON.
- Validation precedes bindings for mutations, and `IMAGES` precedes the ID check for the
  source-image `GET`, so a `503` can mask a `400` and vice versa.
- `PATCH /commissions/:id` returns `200` even when nothing changed.
- Dates after today in UTC+14 are rejected on create and `PATCH`. Because `PATCH` re-validates the
  whole body, an old row with a future `commissionDate` fails every metadata edit (`400`) until the
  date is corrected (AR "Commission fields").
- After an ambiguous failure (timeout, dropped connection) on a mutation, re-read
  (`/bootstrap` or `/characters/:id/commissions`) instead of retrying blindly.

---

## 9. Triggering a Rebuild

`POST /rebuild` is fire-and-forget: it returns `200` when GitHub accepts the dispatch, not when the
site is rebuilt (typically a few minutes). The web build exports D1/R2 once at build time, so admin
edits are not visible on the public site until a rebuild finishes. Treat `502` as "GitHub
unreachable or rejected" and `503` as a missing worker secret.
