import type { HomeTimelineBatchPayload } from '@features/home/commission/batch/homeTimelineBatchPayload'
import type { HomeTimelineBatchManifest } from '@features/home/server/homeTimelineBatches'
import { fetchFreshHomeTimelineBatchManifest, readHomeTimelineBatchManifest } from '@features/home/commission/batch/homeTimelineBatchManifest'
import { renderHomeTimelineBatchPayload } from '@features/home/commission/batch/homeTimelineBatchRender'
import { buildHomeTimelineBatchUrl } from '@features/home/server/homeTimelineBatches'

const batchRequestCache = new Map<string, Promise<HomeTimelineBatchPayload>>()
const LEGACY_TIMELINE_TEMPLATE_SELECTOR = 'template'
const LEGACY_TIMELINE_ROOT_TEMPLATE_SELECTOR = 'template[data-timeline-sections-template="true"]'

async function loadHomeTimelineBatch({ batchIndex, url }: { batchIndex: number, url: string }) {
  const response = await fetch(url)
  if (!response.ok) {
    const error = new Error(`Failed to load timeline batch ${batchIndex}: ${response.status}`) as Error & { httpStatus?: number }
    error.httpStatus = response.status
    throw error
  }

  return (await response.json()) as HomeTimelineBatchPayload
}

/**
 * A page cached across a deploy points at a hashed batch file the deploy deleted. On 404, refresh
 * the manifest and retry once against the current hash instead of surfacing a broken section.
 */
async function retryTimelineBatchWithFreshManifest({
  batchIndex,
  doc,
  error,
  version,
}: {
  batchIndex: number
  doc: Document
  error: unknown
  version?: string
}) {
  if ((error as { httpStatus?: number } | null)?.httpStatus !== 404)
    return null

  const freshManifest = await fetchFreshHomeTimelineBatchManifest(doc)
  const freshVersion = freshManifest?.batchVersions?.[batchIndex]
  if (!freshManifest || !freshVersion || freshVersion === version)
    return null

  const freshUrl = buildHomeTimelineBatchUrl({
    batchIndex,
    locale: freshManifest.locale,
    v: freshVersion,
  })
  try {
    return await loadHomeTimelineBatch({ batchIndex, url: freshUrl })
  }
  catch {
    return null
  }
}

export async function fetchHomeTimelineBatch({
  batchIndex,
  doc,
  manifestOverride,
}: {
  batchIndex: number
  doc: Document
  manifestOverride?: HomeTimelineBatchManifest | null
}) {
  const manifest = manifestOverride ?? readHomeTimelineBatchManifest(doc)
  if (!manifest)
    return null

  const version = manifest.batchVersions?.[batchIndex]
  const url = buildHomeTimelineBatchUrl({
    batchIndex,
    locale: manifest.locale,
    v: version,
  })

  let request = batchRequestCache.get(url)
  if (!request) {
    request = (async () => {
      try {
        return await loadHomeTimelineBatch({ batchIndex, url })
      }
      catch (error) {
        const retried = await retryTimelineBatchWithFreshManifest({ batchIndex, doc, error, version })
        if (retried)
          return retried
        throw error
      }
    })().catch((error) => {
      batchRequestCache.delete(url)
      throw error
    })
    batchRequestCache.set(url, request)
  }

  return request
}

export function clearHomeTimelineBatchRequestCacheForTests() {
  batchRequestCache.clear()
}

export function mountHomeTimelineBatch({
  container,
  payload,
}: {
  container: HTMLElement
  payload: HomeTimelineBatchPayload
}) {
  container.append(renderHomeTimelineBatchPayload(payload))
}

export function mountLegacyHomeTimelineBatch({
  batchIndex,
  container,
  panel,
}: {
  batchIndex: number
  container: HTMLElement
  panel: HTMLElement
}) {
  const template = panel.querySelector<HTMLTemplateElement>(
    `${LEGACY_TIMELINE_TEMPLATE_SELECTOR}[data-timeline-batch-index="${batchIndex}"]`,
  )
  if (template) {
    container.append(template.content.cloneNode(true))
    template.remove()
    return true
  }

  if (batchIndex !== 0) {
    return false
  }

  const legacyTemplate = panel.querySelector<HTMLTemplateElement>(LEGACY_TIMELINE_ROOT_TEMPLATE_SELECTOR)
  if (!legacyTemplate) {
    return false
  }

  container.append(legacyTemplate.content.cloneNode(true))
  legacyTemplate.remove()
  return true
}
