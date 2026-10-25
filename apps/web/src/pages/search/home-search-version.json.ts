import type { APIRoute } from 'astro'
import { buildHomeSearchEntriesArtifact } from '@lib/pipeline/homeSearchEntries'

// Stale HTML names a hashed search-index file a deploy may have replaced; this unhashed,
// no-cache endpoint tells the client the current version for its one retry.
export const GET: APIRoute = () => {
  const { version } = buildHomeSearchEntriesArtifact()
  return new Response(JSON.stringify({ v: version }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
