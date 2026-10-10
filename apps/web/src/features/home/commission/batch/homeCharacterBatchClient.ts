import type { HomeCharacterBatchPayload } from '@features/home/commission/batch/homeCharacterBatchPayload'
import type { HomeCharacterBatchManifest, HomeCharacterBatchStatus } from '@features/home/server/homeCharacterBatches'
import { fetchFreshHomeCharacterBatchManifest, readHomeCharacterBatchManifest } from '@features/home/commission/batch/homeCharacterBatchManifest'
import { renderHomeCharacterBatchPayload } from '@features/home/commission/batch/homeCharacterBatchRender'
import { buildHomeCharacterBatchUrl } from '@features/home/server/homeCharacterBatches'
import { createBatchRequestQueue } from './batchRequestQueue'

const batchRequestQueue = createBatchRequestQueue<HomeCharacterBatchPayload>()
const ACTIVE_TEMPLATE_SELECTOR = 'template[data-active-sections-template="true"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-archived-sections-template="true"]'
const ARCHIVED_DEFERRED_TEMPLATE_SELECTOR = 'template[data-archived-deferred-sections-template="true"]'

function getLegacyArchivedDeferredTemplate(doc: Document) {
  const liveTemplate = doc.querySelector<HTMLTemplateElement>(ARCHIVED_DEFERRED_TEMPLATE_SELECTOR)
  if (liveTemplate)
    return liveTemplate

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  return (
    rootTemplate?.content.querySelector<HTMLTemplateElement>(ARCHIVED_DEFERRED_TEMPLATE_SELECTOR)
    ?? null
  )
}

function getLegacyBatchTotalCount({
  doc,
  status,
}: {
  doc: Document
  status: HomeCharacterBatchStatus
}) {
  if (status === 'active') {
    return doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR) ? 1 : 0
  }

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (!rootTemplate)
    return 0

  return getLegacyArchivedDeferredTemplate(doc) ? 2 : 1
}

export function getHomeCharacterBatchTotalCount({
  doc,
  status,
}: {
  doc: Document
  status: HomeCharacterBatchStatus
}) {
  const manifest = readHomeCharacterBatchManifest(doc)
  return manifest?.[status].totalBatches ?? getLegacyBatchTotalCount({ doc, status })
}

async function loadHomeCharacterBatch({
  batchIndex,
  status,
  url,
}: {
  batchIndex: number
  status: HomeCharacterBatchStatus
  url: string
}): Promise<HomeCharacterBatchPayload> {
  const response = await fetch(url)
  if (!response.ok) {
    const error = new Error(`Failed to load ${status} batch ${batchIndex}: ${response.status}`) as Error & { httpStatus?: number }
    error.httpStatus = response.status
    throw error
  }

  return (await response.json()) as HomeCharacterBatchPayload
}

/**
 * A page cached across a deploy points at a hashed batch file the deploy deleted. On 404, refresh
 * the manifest and retry once against the current hash instead of surfacing a broken section.
 */
async function retryHomeCharacterBatchWithFreshManifest({
  batchIndex,
  doc,
  error,
  status,
  version,
}: {
  batchIndex: number
  doc: Document
  error: unknown
  status: HomeCharacterBatchStatus
  version?: string
}) {
  if ((error as { httpStatus?: number } | null)?.httpStatus !== 404)
    return null

  const freshManifest = await fetchFreshHomeCharacterBatchManifest(doc)
  const freshVersion = freshManifest?.[status].batchVersions?.[batchIndex]
  if (!freshManifest || !freshVersion || freshVersion === version)
    return null

  const freshUrl = buildHomeCharacterBatchUrl({
    batchIndex,
    locale: freshManifest.locale,
    status,
    v: freshVersion,
  })
  try {
    return await loadHomeCharacterBatch({ batchIndex, status, url: freshUrl })
  }
  catch {
    return null
  }
}

export async function fetchHomeCharacterBatch({
  batchIndex,
  doc,
  status,
  manifestOverride,
}: {
  batchIndex: number
  doc: Document
  status: HomeCharacterBatchStatus
  manifestOverride?: HomeCharacterBatchManifest | null
}) {
  const manifest = manifestOverride ?? readHomeCharacterBatchManifest(doc)
  if (!manifest)
    return null

  const version = manifest[status].batchVersions?.[batchIndex]
  const url = buildHomeCharacterBatchUrl({
    batchIndex,
    locale: manifest.locale,
    status,
    v: version,
  })

  return batchRequestQueue.fetch(url, async () => {
    try {
      return await loadHomeCharacterBatch({ batchIndex, status, url })
    }
    catch (error) {
      const retried = await retryHomeCharacterBatchWithFreshManifest({
        batchIndex,
        doc,
        error,
        status,
        version,
      })
      if (retried)
        return retried
      throw error
    }
  })
}

export function prefetchHomeCharacterBatches({
  doc,
  startBatchIndex,
  status,
  targetBatchIndex,
}: {
  doc: Document
  startBatchIndex: number
  status: HomeCharacterBatchStatus
  targetBatchIndex: number
}) {
  const totalBatchCount = getHomeCharacterBatchTotalCount({ doc, status })
  if (totalBatchCount <= 0)
    return

  const firstBatchIndex = Math.max(0, Math.floor(startBatchIndex))
  const finalBatchIndex = Math.min(Math.floor(targetBatchIndex), totalBatchCount - 1)
  if (finalBatchIndex < firstBatchIndex)
    return

  const manifest = readHomeCharacterBatchManifest(doc)
  if (!manifest)
    return

  for (let batchIndex = firstBatchIndex; batchIndex <= finalBatchIndex; batchIndex += 1) {
    const url = buildHomeCharacterBatchUrl({
      batchIndex,
      locale: manifest.locale,
      status,
      v: manifest[status].batchVersions?.[batchIndex],
    })
    void batchRequestQueue.prefetch(url, () => loadHomeCharacterBatch({ batchIndex, status, url })).catch(() => {
      // Ignore prefetch failures and fall back to on-demand loading later.
    })
  }
}

export function clearHomeCharacterBatchRequestCacheForTests() {
  batchRequestQueue.clearForTests()
}

export function mountHomeCharacterBatch({
  container,
  payload,
}: {
  container: HTMLElement
  payload: HomeCharacterBatchPayload
}) {
  container.append(renderHomeCharacterBatchPayload(payload))
}

export function mountLegacyHomeCharacterBatch({
  batchIndex,
  container,
  doc,
  status,
}: {
  batchIndex: number
  container: HTMLElement
  doc: Document
  status: HomeCharacterBatchStatus
}) {
  if (status === 'active') {
    if (batchIndex !== 0)
      return false

    const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
    if (!template)
      return false

    container.append(template.content.cloneNode(true))
    return true
  }

  if (batchIndex === 0) {
    const template = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
    if (!template)
      return false

    const fragment = template.content.cloneNode(true) as DocumentFragment
    fragment.querySelectorAll(ARCHIVED_DEFERRED_TEMPLATE_SELECTOR).forEach((node) => {
      node.remove()
    })

    container.append(fragment)
    return true
  }

  if (batchIndex === 1) {
    const template = getLegacyArchivedDeferredTemplate(doc)
    if (!template)
      return false

    container.append(template.content.cloneNode(true))
    return true
  }

  return false
}
