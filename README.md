# Commission Index

Don't look.

Personal use only

## Development

- `bun run dev` — run Astro web + admin API (Node + tsx) in development mode.
- `bun run dev:astro` — run Astro web only.
- `bun run dev:web` — run legacy Vite web only (rollback path).
- `bun run dev:api` — run admin API only.
- `bun run build` — run Astro static build output to `dist/`.
- `bun run build:vite` — run legacy Vite static build.

Asset generation (`assets:dev` / `assets:build`) is shared by Astro/Vite:

- Dev startup triggers `home-update-summary` + `home-search-entries`.
- Production build startup triggers `home-update-summary`, `home-search-entries`, `rss`, and `images`.

### Dev ports

- `ADMIN_API_PORT` controls the admin API listening port.
- `VITE_ADMIN_API_PORT` controls Vite `/api` proxy target.
- `bun run dev` sets both variables to the same value automatically.

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
