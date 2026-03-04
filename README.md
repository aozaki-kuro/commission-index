# Commission Index

Don't look.

Personal use only

## Development

- `bun run dev` — run Astro web in development mode (`/api/admin/*` handled inside Astro dev middleware).
- Admin pages (`/admin`, `/admin/aliases`) are injected only in development and are not part of production build output.
- `bun run build` — run Astro static build output to `dist/`.
- `bun run preview` — preview static output locally.

## Tests

- `bun run test` / `bun run test:core` — run core regression tests for search/navigation/data and one search UI smoke test.
- `bun run test:full` — run the full Vitest suite, including lower-change UI behavior tests.
- `bun run test:watch` — watch core tests.
- `bun run test:watch:full` — watch the full suite.
- `bun run test:changed` — run changed core tests only.

Asset generation is shared by Astro:

- Dev startup triggers `home-update-summary` + `home-search-entries`.
- Production build startup triggers `home-update-summary`, `home-search-entries`, `rss`, and `images`.

### Dev ports

- `PORT` controls Astro dev port (default `5173`).

### Production `/admin` verification

- Production deployment is static-only (no Worker entrypoint).
- `/admin` and `/api/admin/*` return 404 from static `assets.not_found_handling = "404-page"`.
- `/admin` and `/api/admin/*` are explicitly mapped to `404` in `public/_redirects`.
- `vite preview` does not validate edge HTTP status behavior for static host routing.
- Verify using deployed Cloudflare URL:

```bash
curl -I https://<your-domain>/admin
curl -I https://<your-domain>/admin/aliases
curl -I https://<your-domain>/api/admin/bootstrap
```

- Expected result: all above endpoints return `404`.
