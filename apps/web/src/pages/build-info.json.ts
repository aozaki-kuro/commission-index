import type { APIRoute } from 'astro'
import { createPublicBuildInfo } from '@commission-index/domain'
import { getGeneratedFactSourceContent } from '@data/generatedFactSource'

export const GET: APIRoute = () => {
  const { meta } = getGeneratedFactSourceContent()
  const info = createPublicBuildInfo(meta, new Date().toISOString())
  return new Response(`${JSON.stringify(info)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
