import type { HomeTimelineBatchManifest } from '@features/home/server/homeTimelineBatches'
import { normalizeBatchTargetId } from './batchManifest'
import { batchFetchInit } from './batchRequestQueue'

const MANIFEST_SELECTOR = 'script[data-home-timeline-batch-manifest="true"]'
const TIMELINE_PANEL_SELECTOR = '[data-commission-view-panel="timeline"]'

// Keyed by the script element, not the Document: ClientRouter swaps the body on soft navigation
// (e.g. a locale switch), which replaces the element and must invalidate the cache.
let manifestCache = new WeakMap<HTMLScriptElement, HomeTimelineBatchManifest | null>()

export function hasConnectedTimelinePanelTargetId(doc: Document, targetId: string) {
  const element = doc.getElementById(targetId)
  return element?.isConnected === true && element.closest(TIMELINE_PANEL_SELECTOR) !== null
}

export { normalizeBatchTargetId as normalizeHomeTimelineTargetId }

export function readHomeTimelineBatchManifest(doc?: Document): HomeTimelineBatchManifest | null {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return null

  const script = resolvedDocument.querySelector<HTMLScriptElement>(MANIFEST_SELECTOR)
  if (!script)
    return null

  if (manifestCache.has(script)) {
    return manifestCache.get(script) ?? null
  }

  if (!script.textContent) {
    manifestCache.set(script, null)
    return null
  }

  try {
    const manifest = JSON.parse(script.textContent) as HomeTimelineBatchManifest
    manifestCache.set(script, manifest)
    return manifest
  }
  catch {
    manifestCache.set(script, null)
    return null
  }
}

export function clearHomeTimelineBatchManifestCacheForTests(doc?: Document) {
  if (doc) {
    const script = doc.querySelector<HTMLScriptElement>(MANIFEST_SELECTOR)
    if (script)
      manifestCache.delete(script)
    return
  }

  manifestCache = new WeakMap<HTMLScriptElement, HomeTimelineBatchManifest | null>()
}

export function hasDeferredHomeTimelineTarget({
  doc,
  rawTargetId,
}: {
  doc: Document
  rawTargetId: string | null | undefined
}) {
  const targetId = normalizeBatchTargetId(rawTargetId)
  if (!targetId)
    return false
  if (hasConnectedTimelinePanelTargetId(doc, targetId))
    return false

  const manifest = readHomeTimelineBatchManifest(doc)
  return manifest ? targetId in manifest.targetBatchById : false
}

export function resolveHomeTimelineTargetBatch({
  doc,
  rawTargetId,
}: {
  doc: Document
  rawTargetId: string | null | undefined
}) {
  const targetId = normalizeBatchTargetId(rawTargetId)
  if (!targetId)
    return null
  if (hasConnectedTimelinePanelTargetId(doc, targetId))
    return null

  const manifest = readHomeTimelineBatchManifest(doc)
  if (!manifest)
    return null

  const batchIndex = manifest.targetBatchById[targetId]
  return Number.isInteger(batchIndex) ? batchIndex : null
}

export async function fetchFreshHomeTimelineBatchManifest(doc?: Document): Promise<HomeTimelineBatchManifest | null> {
  try {
    const locale = readHomeTimelineBatchManifest(doc)?.locale ?? 'en'
    const response = await fetch(`/search/home-timeline-manifest/${locale}.json?_t=${Date.now()}`, batchFetchInit())
    if (!response.ok)
      return null
    return (await response.json()) as HomeTimelineBatchManifest
  }
  catch {
    return null
  }
}
