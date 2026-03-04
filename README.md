# Commission Index

Don't look.

Personal use only

## Development

- `bun run dev` — run Astro web in development mode (`/api/admin/*` handled inside Astro dev middleware).
- Admin pages (`/admin`, `/admin/aliases`) are injected only in development and are not part of production build output.
- `bun run build` — run Astro static build output to `dist/`.
- `bun run preview` — preview static output locally.
- Admin page includes a dev-only floating `Refresh Assets Cache` button for manual asset resync.

## Tests

- `bun run test` — run the full Vitest suite.
- `bun run test:watch` — watch tests during local development.
- `bun run test:changed` — run changed tests only.

Asset generation is shared by Astro:

- Dev startup triggers full asset sync (`home-update-summary`, `home-search-entries`, `rss`, `images`).
- Admin write operations in development trigger queued full asset sync (write-through, coalesced).
- Production build startup triggers full asset sync before page generation.

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
