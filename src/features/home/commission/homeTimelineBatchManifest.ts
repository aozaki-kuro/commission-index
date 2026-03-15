import type { HomeTimelineBatchManifest } from '#features/home/server/homeTimelineBatches'

const MANIFEST_SELECTOR = 'script[data-home-timeline-batch-manifest="true"]'

let manifestCache = new WeakMap<Document, HomeTimelineBatchManifest | null>()

function hasConnectedElementById(doc: Document, id: string) {
  const element = doc.getElementById(id)
  return Boolean(element?.isConnected)
}

export function normalizeHomeTimelineTargetId(rawValue: string | null | undefined) {
  if (!rawValue)
    return ''

  const value = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue
  if (!value)
    return ''

  try {
    return decodeURIComponent(value)
  }
  catch {
    return ''
  }
}

export function readHomeTimelineBatchManifest(doc?: Document): HomeTimelineBatchManifest | null {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return null

  if (manifestCache.has(resolvedDocument)) {
    return manifestCache.get(resolvedDocument) ?? null
  }

  const script = resolvedDocument.querySelector<HTMLScriptElement>(MANIFEST_SELECTOR)
  if (!script?.textContent) {
    manifestCache.set(resolvedDocument, null)
    return null
  }

  try {
    const manifest = JSON.parse(script.textContent) as HomeTimelineBatchManifest
    manifestCache.set(resolvedDocument, manifest)
    return manifest
  }
  catch {
    manifestCache.set(resolvedDocument, null)
    return null
  }
}

export function clearHomeTimelineBatchManifestCacheForTests(doc?: Document) {
  if (doc) {
    manifestCache.delete(doc)
    return
  }

  manifestCache = new WeakMap<Document, HomeTimelineBatchManifest | null>()
}

export function hasDeferredHomeTimelineTarget({
  doc,
  rawTargetId,
}: {
  doc: Document
  rawTargetId: string | null | undefined
}) {
  const targetId = normalizeHomeTimelineTargetId(rawTargetId)
  if (!targetId)
    return false
  if (hasConnectedElementById(doc, targetId))
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
  const targetId = normalizeHomeTimelineTargetId(rawTargetId)
  if (!targetId)
    return null
  if (hasConnectedElementById(doc, targetId))
    return null

  const manifest = readHomeTimelineBatchManifest(doc)
  if (!manifest)
    return null

  const batchIndex = manifest.targetBatchById[targetId]
  return Number.isInteger(batchIndex) ? batchIndex : null
}
