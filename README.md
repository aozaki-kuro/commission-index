# Commission Index

Don't look.

Personal use only

## Development

- `bun run dev` — run Vite web + admin API (Node + tsx) in development mode.
- `bun run dev:web` — run Vite web only.
- `bun run dev:api` — run admin API only.
- `bun run build` — generate assets and build static output to `dist/`.

### Dev ports

- `ADMIN_API_PORT` controls the admin API listening port.
- `VITE_ADMIN_API_PORT` controls Vite `/api` proxy target.
- `bun run dev` sets both variables to the same value automatically.

### Production `/admin` verification

- Production deployment is static-only (no Worker entrypoint).
- `/admin` and `/api/admin/*` return 404 from static `assets.not_found_handling = "404-page"`.
- `/support` and `/support/` are explicitly rewritten to `/index.html` via `public/_redirects`.
- `vite preview` does not validate edge HTTP status behavior for static host routing.
- Verify using deployed Cloudflare URL:

```bash
curl -I https://<your-domain>/admin
curl -I https://<your-domain>/admin/aliases
curl -I https://<your-domain>/api/admin/bootstrap
```

- Expected result: all above endpoints return `404`.
