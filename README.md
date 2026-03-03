# Commission Index

Don't look.

Personal use only

## Development

- `bun run dev` — run Astro web in development mode (`/api/admin/*` handled inside Astro dev middleware).
- `bun run dev:astro` — run Astro web only (same in-process admin API behavior).
- Admin pages (`/admin`, `/admin/aliases`) are injected only in development and are not part of production build output.
- `bun run dev:api` — run admin API only.
- `bun run build` — run Astro static build output to `dist/`.
- `bun run preview:astro` — preview static output locally.

Asset generation (`assets:dev` / `assets:build`) is shared by Astro:

- Dev startup triggers `home-update-summary` + `home-search-entries`.
- Production build startup triggers `home-update-summary`, `home-search-entries`, `rss`, and `images`.

### Dev ports

- `PORT` controls Astro dev port (default `5173`).
- `ADMIN_API_PORT` controls standalone `dev:api` port if you run API separately.

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
