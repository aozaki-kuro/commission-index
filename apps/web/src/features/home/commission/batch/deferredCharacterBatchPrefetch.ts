import { prefetchHomeCharacterBatches } from '@features/home/commission/batch/homeCharacterBatchClient'
import {
  hasDeferredActiveCharacterTarget,
  readActiveCharactersLoadedBatchCount,
  resolveDeferredActiveCharacterBatch,
} from '@features/home/commission/loader/activeCharactersEvent'

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
