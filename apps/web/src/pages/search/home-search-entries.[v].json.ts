import type { APIRoute } from 'astro'
import { buildHomeSearchEntriesArtifact } from '@lib/pipeline/homeSearchEntries'

export function getStaticPaths() {
  const { version } = buildHomeSearchEntriesArtifact()
  return [{ params: { v: version } }]
}

export const GET: APIRoute = ({ params }) => {
  const { entries, version } = buildHomeSearchEntriesArtifact()
  if (params.v !== version) {
    return new Response(null, { status: 404 })
  }

  return new Response(`${JSON.stringify(entries, null, 2)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
