import type { TimelineYearGroup } from '#lib/commissions/timeline'
import { getCharacterSectionId } from '#lib/characters/nav'
import { parseCommissionFileName } from '#lib/commissions'

export interface HomeTimelineBatchPlan {
  initialGroups: TimelineYearGroup[]
  batches: TimelineYearGroup[][]
  totalBatches: number
  targetBatchById: Record<string, number>
}

export interface HomeTimelineBatchManifest {
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
        const { date } = parseCommissionFileName(entry.commission.fileName)
        const entryAnchorPrefix = getCharacterSectionId(entry.character)
        targetBatchById[`${entryAnchorPrefix}-${date}`] = batchIndex
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

export function buildHomeTimelineBatchManifest({
  plan,
}: {
  plan: HomeTimelineBatchPlan
}): HomeTimelineBatchManifest {
  return {
    initialSectionIds: plan.initialGroups.map(group => group.sectionId),
    totalBatches: plan.totalBatches,
    targetBatchById: plan.targetBatchById,
  }
}
