# Cache correctness, Turbo removal, CI speed-up (2026-10-10)

Status (2026-10-10): WP-A, WP-B, WP-C1, WP-C2 and the WP-E doc fixes are merged and deployed (PR #381, master
`cc7b7d4`); production headers verified. Still open: verify the C1/C2 paths in a real Actions run, decide WP-C3
after measuring, WP-D deferred. See `HANDOFF.md`. Source: three read-only investigations (Cloudflare docs, CI logs,
batch-versioning code) + production header probe.

## Verified facts (all drive the decisions below)

- Production probe (`crystallize.cc`): `ETag` is present even when `_headers` overrides `Cache-Control`;
  `If-None-Match` returns **304**; `?v=aaa` and `?v=zzz` return identical bytes — static assets match on pathname
  only (Cloudflare docs: "Only the URL pathname is used to match assets"). `cf-cache-status: HIT` on the edge.
- Current `?v=` therefore protects only the _browser_ cache key. It does not make HTML and batch consistent, and
  it covers neither the localized messages in the payload nor anything else not hand-listed in the hash.
- Current `_headers` gives HTML, batches and search entries `max-age=300, stale-while-revalidate=86400`: after a
  deploy a returning visitor can see the old copy first (one reload to fix), for up to a day.
- Client never validates a fetched batch against what the HTML expected.
- CI image cache: introduced in `89797f2` (2026-10-09). The only observed full miss (run 37956089316) is that very
  commit, i.e. cold start. The handoff's "often misses" came from pre-cache runs. The "reservation conflicted"
  save is real but benign: restore key is `run_id` (never an exact hit), so save always runs and collides with the
  existing revision key. Total repo cache is 1.27 GiB, so LRU pressure is not a factor.
- Master CI critical path ≈ `build` 66s → `web` 62s (admin 43s in parallel). Per-job setup ≈ 22s. Turbo task
  cache hits in CI: 0.

## Decision: caching model

Content-addressed filenames for data that changes rarely; revalidation for everything that names them.

| Resource                                      | Policy                                                   | Why                                                    |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `/_astro/*`                                   | 1y immutable (unchanged)                                 | already fingerprinted                                  |
| batch JSON + search-entries JSON              | **hash in filename**, 1y immutable                       | unchanged data → zero requests; changed data → new URL |
| HTML, manifests, `build-info.json`, `rss.xml` | `no-cache` (always revalidate, 304 when unchanged)       | this is what makes updates immediate; they are tiny    |
| everything else                               | Cloudflare default (`max-age=0, must-revalidate` + ETag) |                                                        |

Why filename and not `?v=` + immutable: the server ignores the query, so a stale page requesting `?v=old` would
silently receive new bytes and cache them forever under the old key. A missing hashed file is a loud 404 that the
existing manifest fallback already handles. The hash is computed over the **final serialized payload**, so no input
can be forgotten (this closes the locale-message gap by construction).

Tab left open across a deploy: its HTML points at a deleted hashed file → 404 → existing stale-HTML manifest
fallback fetches the fresh manifest. Keep that fallback; extend it to trigger on batch 404, not only on a hash
navigation miss.

Fallback if hashed Astro route params are not workable (spike first): drop `?v=`/`batchVersions` entirely and serve
batches with the Cloudflare default (revalidate + 304). Costs one conditional request per batch; for 141 works that
is negligible, and it is strictly simpler. Not preferred because it forgoes zero-request reuse.

## Work packages (execute in this order; each is its own branch/worktree, no commits without owner ask)

### WP-A — cache correctness (apps/web)

1. Spike: can `getStaticPaths` emit `<batch>.<hash>.json` (param containing a dot) for the three endpoints?
2. Failing test first: changing a localized message or any payload field changes the batch URL; unchanged payload →
   identical URL across two builds.
3. Hash = djb2/base36 (existing `hashString`) of the serialized payload; manifest and endpoint share one builder
   (memoized) so they cannot disagree. Search entries likewise (`home-search-entries.<v>.json`).
4. Client URL builders use the filename form; remove `?v=`; fallback also on batch/search-entries 404.
5. `_headers` per table above; drop the 300s/SWR rules.
6. Docs: root `AGENTS.md` Home Page Architecture ("Batch URL versioning"), `docs/`.
   Gate: `pnpm run lint`, `typecheck`, `test`; `VISUAL_OFFLINE=1` server-start smoke; after deploy re-run the header probe.

### WP-B — remove Turbo

Replace the 5 root scripts with plain pnpm (`typecheck` → `pnpm -r run typecheck`, verify it is race-free; keep script
name `build:web` and `FACT_SOURCE_USE_EXISTING_SNAPSHOT=1` semantics for `apps/web/wrangler.jsonc` custom build).
Delete `turbo.json`, devDependency, `.gitignore` `.turbo`, `.github/renovate.json:86`, `TURBO_TELEMETRY_DISABLED`,
AGENTS Turbo section and lockfile entries. Gate: full lint/typecheck/test/build locally, then CI.

### WP-C — CI speed

- C1 (cheap): image-cache save only when `steps.restore-images.outputs.cache-matched-key` != the new revision key
  (removes the conflict noise; fix the misleading "save is skipped" comment).
- C2: rebuild skips `validate-code` when the check-runs API shows `Validate & Build` succeeded for `GITHUB_SHA`;
  missing / in-progress / failed → validate as today. Saves ≈ 45s of ≈ 105s per data update.
- C3 (measure C1+C2 first, then decide): start `web` in parallel with `build` and gate only the deploy step on the
  `Validate & Build` job conclusion (poll the run's jobs API, needs `actions: read`). Saves ≈ 55s of ≈ 130s on master.
  Cost: polling step; lock is held while waiting. Skip if gain is not worth the complexity after C1/C2.
- Not doing: Astro `cacheDir` persistence (astro build is ~12s total; measure image-processing share before any work),
  merging jobs (loses lock structure), caching `node_modules`.

### WP-D — admin dev via Vite plugin (deferred)

Only ~1s faster; value is single process/port and deleting CORS + `devAdminRemote.ts`. Blocked on the owner's tmux
Ctrl+C/Enter comparison (HANDOFF §1). Not started; revisit after A–C.

### WP-E — stale docs (fold into whichever WP touches the file)

Workers Builds is not the deploy path: `apps/admin-worker/wrangler.jsonc:4-7` (also wrong `build:assets` name),
`apps/web/wrangler.jsonc:4`, root `AGENTS.md` "Cloudflare Deploy", `README.md:54`,
`docs/audit-2026-10-05-web-architecture.md:155`.

## Open items for the owner (none block A–C)

- PERF-02 / branch protection / R2 orphan script / post-deploy CJK search spot check (see HANDOFF "上一轮遗留").
- Delete the spike worktree `.claude/worktrees/agent-a9f0bf29c700a7946` once WP-D is decided.
