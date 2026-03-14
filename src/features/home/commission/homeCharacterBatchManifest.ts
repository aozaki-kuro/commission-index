import type {
  HomeCharacterBatchManifest,
  HomeCharacterBatchStatus,
} from '#features/home/server/homeCharacterBatches'

const MANIFEST_SELECTOR = 'script[data-home-character-batch-manifest="true"]'

let manifestCache = new WeakMap<Document, HomeCharacterBatchManifest | null>()

export function normalizeHomeCharacterTargetId(rawValue: string | null | undefined) {
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

export function readHomeCharacterBatchManifest(doc?: Document): HomeCharacterBatchManifest | null {
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
    const manifest = JSON.parse(script.textContent) as HomeCharacterBatchManifest
    manifestCache.set(resolvedDocument, manifest)
    return manifest
  }
  catch {
    manifestCache.set(resolvedDocument, null)
    return null
  }
}

export function clearHomeCharacterBatchManifestCacheForTests(doc?: Document) {
  if (doc) {
    manifestCache.delete(doc)
    return
  }

  manifestCache = new WeakMap<Document, HomeCharacterBatchManifest | null>()
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
  const targetId = normalizeHomeCharacterTargetId(rawTargetId)
  if (!targetId)
    return false
  if (doc.getElementById(targetId))
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
  const targetId = normalizeHomeCharacterTargetId(rawTargetId)
  if (!targetId)
    return null

  const manifest = readHomeCharacterBatchManifest(doc)
  if (!manifest)
    return null

  const batchIndex = manifest[status].targetBatchById[targetId]
  return Number.isInteger(batchIndex) ? batchIndex : null
}
