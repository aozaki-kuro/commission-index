import type {
  HomeCharacterBatchManifest,
  HomeCharacterBatchStatus,
} from '@features/home/server/homeCharacterBatches'
import { normalizeBatchTargetId } from './batchManifest'

const MANIFEST_SELECTOR = 'script[data-home-character-batch-manifest="true"]'
const CHARACTER_PANEL_SELECTOR = '[data-commission-view-panel="character"]'

// Keyed by the script element, not the Document: ClientRouter swaps the body on soft navigation
// (e.g. a locale switch), which replaces the element and must invalidate the cache.
let manifestCache = new WeakMap<HTMLScriptElement, HomeCharacterBatchManifest | null>()

export function hasConnectedCharacterPanelTargetId(doc: Document, targetId: string) {
  const element = doc.getElementById(targetId)
  return element?.isConnected === true && element.closest(CHARACTER_PANEL_SELECTOR) !== null
}

export { normalizeBatchTargetId as normalizeHomeCharacterTargetId }

export function readHomeCharacterBatchManifest(doc?: Document): HomeCharacterBatchManifest | null {
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
    const manifest = JSON.parse(script.textContent) as HomeCharacterBatchManifest
    manifestCache.set(script, manifest)
    return manifest
  }
  catch {
    manifestCache.set(script, null)
    return null
  }
}

export function clearHomeCharacterBatchManifestCacheForTests(doc?: Document) {
  if (doc) {
    const script = doc.querySelector<HTMLScriptElement>(MANIFEST_SELECTOR)
    if (script)
      manifestCache.delete(script)
    return
  }

  manifestCache = new WeakMap<HTMLScriptElement, HomeCharacterBatchManifest | null>()
}

export function hasDeferredHomeCharacterTarget({
  doc,
  rawTargetId,
  status,
}: {
  doc: Document
  rawTargetId: string | null | undefined
  status: HomeCharacterBatchStatus
}) {
  const targetId = normalizeBatchTargetId(rawTargetId)
  if (!targetId)
    return false
  if (hasConnectedCharacterPanelTargetId(doc, targetId))
    return false

  const manifest = readHomeCharacterBatchManifest(doc)
  return manifest ? targetId in manifest[status].targetBatchById : false
}

export function resolveHomeCharacterTargetBatch({
  doc,
  rawTargetId,
  status,
}: {
  doc: Document
  rawTargetId: string | null | undefined
  status: HomeCharacterBatchStatus
}) {
  const targetId = normalizeBatchTargetId(rawTargetId)
  if (!targetId)
    return null
  if (hasConnectedCharacterPanelTargetId(doc, targetId))
    return null

  const manifest = readHomeCharacterBatchManifest(doc)
  if (!manifest)
    return null

  const batchIndex = manifest[status].targetBatchById[targetId]
  return Number.isInteger(batchIndex) ? batchIndex : null
}

export async function fetchFreshHomeCharacterBatchManifest(doc?: Document): Promise<HomeCharacterBatchManifest | null> {
  try {
    const locale = readHomeCharacterBatchManifest(doc)?.locale ?? 'en'
    const response = await fetch(`/search/home-character-manifest/${locale}.json?_t=${Date.now()}`)
    if (!response.ok)
      return null
    return (await response.json()) as HomeCharacterBatchManifest
  }
  catch {
    return null
  }
}
