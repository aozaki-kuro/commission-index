import type { TimelineYearGroup } from '@commission-index/domain'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import { getCharacterSectionId } from '@lib/characters/nav'

export interface HomeTimelineBatchPlan {
  initialGroups: TimelineYearGroup[]
  batches: TimelineYearGroup[][]
  totalBatches: number
  targetBatchById: Record<string, number>
}

export interface HomeTimelineBatchManifest {
  locale: HomeLocale
  /** Content-hash digest of every serialized batch payload. */
  v?: string
  /** Content-hash of each final serialized payload; names the immutable batch file. Index matches batch index. */
  batchVersions?: string[]
  initialSectionIds: string[]
  totalBatches: number
  targetBatchById: Record<string, number>
}

const TIMELINE_INITIAL_YEAR_COUNT = 1
const TIMELINE_BATCH_SIZE = 1

function chunk(values: TimelineYearGroup[], batchSize: number) {
  if (values.length === 0)
    return []

  const batches: TimelineYearGroup[][] = []
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize))
  }
  return batches
}

function buildTargetBatchById(batches: TimelineYearGroup[][]) {
  const targetBatchById: Record<string, number> = {}

  batches.forEach((groups, batchIndex) => {
    groups.forEach((group) => {
      targetBatchById[group.sectionId] = batchIndex
      targetBatchById[group.titleId] = batchIndex

      group.entries.forEach((entry) => {
        const entryAnchorPrefix = getCharacterSectionId(entry.character)
        targetBatchById[`${entryAnchorPrefix}-commission-${entry.commission.publicId}`] = batchIndex
        const compactDate = entry.commission.commissionDate?.replaceAll('-', '')
        if (compactDate) {
          targetBatchById[`${entryAnchorPrefix}-${compactDate}`] = batchIndex
        }
      })
    })
  })

  return targetBatchById
}

export function buildHomeTimelineBatchPlan({
  groups,
}: {
  groups: TimelineYearGroup[]
}): HomeTimelineBatchPlan {
  const initialGroups = groups.slice(0, TIMELINE_INITIAL_YEAR_COUNT)
  const deferredGroups = groups.slice(TIMELINE_INITIAL_YEAR_COUNT)
  const batches = chunk(deferredGroups, TIMELINE_BATCH_SIZE)

  return {
    initialGroups,
    batches,
    totalBatches: batches.length,
    targetBatchById: buildTargetBatchById(batches),
  }
}

export function buildHomeTimelineBatchUrl({
  batchIndex,
  locale,
  v,
}: {
  batchIndex: number
  locale: HomeLocale
  v?: string
}) {
  const base = `/search/home-timeline-batches/${locale}/${batchIndex}`
  return v ? `${base}.${v}.json` : `${base}.json`
}
