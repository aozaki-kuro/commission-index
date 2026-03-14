import type { HomeCharacterBatchPayload } from '#features/home/commission/homeCharacterBatchPayload'
import { renderHomeCharacterBatchPayload } from '#features/home/commission/homeCharacterBatchRender'
import { readHomeCharacterBatchManifest } from '#features/home/commission/homeCharacterBatchManifest'
import {
  buildHomeCharacterBatchUrl,
  type HomeCharacterBatchStatus,
} from '#features/home/server/homeCharacterBatches'

const batchRequestCache = new Map<string, Promise<HomeCharacterBatchPayload>>()
const ACTIVE_TEMPLATE_SELECTOR = 'template[data-active-sections-template="true"]'
const STALE_TEMPLATE_SELECTOR = 'template[data-stale-sections-template="true"]'
const STALE_DEFERRED_TEMPLATE_SELECTOR = 'template[data-stale-deferred-sections-template="true"]'

const getLegacyStaleDeferredTemplate = (doc: Document) => {
  const liveTemplate = doc.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR)
  if (liveTemplate) return liveTemplate

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  return (
    rootTemplate?.content.querySelector<HTMLTemplateElement>(STALE_DEFERRED_TEMPLATE_SELECTOR) ??
    null
  )
}

const getLegacyBatchTotalCount = ({
  doc,
  status,
}: {
  doc: Document
  status: HomeCharacterBatchStatus
}) => {
  if (status === 'active') {
    return doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR) ? 1 : 0
  }

  const rootTemplate = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
  if (!rootTemplate) return 0

  return getLegacyStaleDeferredTemplate(doc) ? 2 : 1
}

export const getHomeCharacterBatchTotalCount = ({
  doc,
  status,
}: {
  doc: Document
  status: HomeCharacterBatchStatus
}) => {
  const manifest = readHomeCharacterBatchManifest(doc)
  return manifest?.[status].totalBatches ?? getLegacyBatchTotalCount({ doc, status })
}

export const hasMoreHomeCharacterBatches = ({
  doc,
  loadedBatchCount,
  status,
}: {
  doc: Document
  loadedBatchCount: number
  status: HomeCharacterBatchStatus
}) => loadedBatchCount < getHomeCharacterBatchTotalCount({ doc, status })

export const fetchHomeCharacterBatch = async ({
  batchIndex,
  doc,
  status,
}: {
  batchIndex: number
  doc: Document
  status: HomeCharacterBatchStatus
}) => {
  const manifest = readHomeCharacterBatchManifest(doc)
  if (!manifest) return null

  const url = buildHomeCharacterBatchUrl({
    batchIndex,
    locale: manifest.locale,
    status,
  })

  let request = batchRequestCache.get(url)
  if (!request) {
    request = fetch(url).then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to load ${status} batch ${batchIndex}: ${response.status}`)
      }

      return (await response.json()) as HomeCharacterBatchPayload
    })
    batchRequestCache.set(url, request)
  }

  return request
}

export const mountHomeCharacterBatch = ({
  container,
  payload,
}: {
  container: HTMLElement
  payload: HomeCharacterBatchPayload
}) => {
  container.append(renderHomeCharacterBatchPayload(payload))
}

export const mountLegacyHomeCharacterBatch = ({
  batchIndex,
  container,
  doc,
  status,
}: {
  batchIndex: number
  container: HTMLElement
  doc: Document
  status: HomeCharacterBatchStatus
}) => {
  if (status === 'active') {
    if (batchIndex !== 0) return false

    const template = doc.querySelector<HTMLTemplateElement>(ACTIVE_TEMPLATE_SELECTOR)
    if (!template) return false

    container.append(template.content.cloneNode(true))
    return true
  }

  if (batchIndex === 0) {
    const template = doc.querySelector<HTMLTemplateElement>(STALE_TEMPLATE_SELECTOR)
    if (!template) return false

    const fragment = template.content.cloneNode(true) as DocumentFragment
    fragment.querySelectorAll(STALE_DEFERRED_TEMPLATE_SELECTOR).forEach(node => {
      node.remove()
    })

    container.append(fragment)
    return true
  }

  if (batchIndex === 1) {
    const template = getLegacyStaleDeferredTemplate(doc)
    if (!template) return false

    container.append(template.content.cloneNode(true))
    return true
  }

  return false
}
