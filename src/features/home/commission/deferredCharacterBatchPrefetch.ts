import {
  hasDeferredActiveCharacterTarget,
  readActiveCharactersLoadedBatchCount,
  resolveDeferredActiveCharacterBatch,
} from '#features/home/commission/activeCharactersEvent'
import { prefetchHomeCharacterBatches } from '#features/home/commission/homeCharacterBatchClient'
import { normalizeHomeCharacterTargetId } from '#features/home/commission/homeCharacterBatchManifest'
import {
  hasStaleCharacterTarget,
  readStaleCharactersLoadedBatchCount,
  resolveDeferredStaleCharacterBatch,
} from '#features/home/commission/staleCharactersEvent'

function resolveTargetSectionId(rawTargetId: string | null | undefined) {
  return normalizeHomeCharacterTargetId(rawTargetId) || null
}

export function prefetchDeferredActiveCharacterTarget(doc: Document, targetId: string | null | undefined) {
  if (!hasDeferredActiveCharacterTarget(doc, targetId))
    return

  const batchIndex = resolveDeferredActiveCharacterBatch(doc, targetId)
  if (batchIndex === null)
    return

  prefetchHomeCharacterBatches({
    doc,
    startBatchIndex: readActiveCharactersLoadedBatchCount(doc),
    status: 'active',
    targetBatchIndex: batchIndex,
  })
}

export function prefetchDeferredStaleCharacterTarget(doc: Document, targetId: string | null | undefined) {
  const sectionId = resolveTargetSectionId(targetId)
  if (sectionId && doc.getElementById(sectionId))
    return
  if (!hasStaleCharacterTarget(doc, targetId))
    return

  const batchIndex = resolveDeferredStaleCharacterBatch(doc, targetId)
  if (batchIndex === null)
    return

  prefetchHomeCharacterBatches({
    doc,
    startBatchIndex: readStaleCharactersLoadedBatchCount(doc),
    status: 'stale',
    targetBatchIndex: batchIndex,
  })
}
