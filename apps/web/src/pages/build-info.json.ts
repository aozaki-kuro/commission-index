import type { BuildInfo } from '@commission-index/domain'
import type { APIRoute } from 'astro'
import { getGeneratedFactSourceContent } from '@data/generatedFactSource'

export const GET: APIRoute = () => {
  const { meta } = getGeneratedFactSourceContent()
  const codeSha = import.meta.env.WORKERS_CI_COMMIT_SHA || import.meta.env.GITHUB_SHA || null
  const info: BuildInfo = {
    dataRevision: meta.revision,
    dataExportedAt: meta.exportedAt,
    codeSha,
    builtAt: new Date().toISOString(),
  }
  return new Response(`${JSON.stringify(info)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
