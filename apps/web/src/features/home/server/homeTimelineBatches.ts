import type { HomeLocale } from '@features/home/i18n/homeLocale'
import type { TimelineYearGroup } from '@lib/commissions/timeline'
import { getCharacterSectionId } from '@lib/characters/nav'
import { hashString } from '@lib/utils/hash'

export interface HomeTimelineBatchPlan {
  initialGroups: TimelineYearGroup[]
  batches: TimelineYearGroup[][]
  totalBatches: number
  targetBatchById: Record<string, number>
}

export interface HomeTimelineBatchManifest {
  locale: HomeLocale
  /** Global content hash — covers all timeline commissions. */
  v?: string
  /** Per-batch content hashes for cache-busting. Index matches batch index. */
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

function serializeGroupsForHash(groups: TimelineYearGroup[]) {
  // Include character names so renames also invalidate the cache (they affect entry anchors and search keys).
  return groups.flatMap(g => g.entries.map(e => [e.character, e.commission]))
}

function computeTimelinePerBatchVersions(plan: HomeTimelineBatchPlan, contextHash?: string): string[] {
  const prefix = contextHash ?? ''
  return plan.batches.map(groups =>
    hashString(prefix + JSON.stringify(serializeGroupsForHash(groups))),
  )
}

function computeTimelineGlobalVersion(plan: HomeTimelineBatchPlan, contextHash?: string): string {
  return hashString(
    (contextHash ?? '') + JSON.stringify(serializeGroupsForHash([...plan.initialGroups, ...plan.batches.flat()])),
  )
}

export function buildHomeTimelineBatchManifest({
  contextHash,
  locale,
  plan,
}: {
  /** Pre-computed hash of non-commission inputs (aliases, labels) that affect batch JSON content. */
  contextHash?: string
  locale: HomeLocale
  plan: HomeTimelineBatchPlan
}): HomeTimelineBatchManifest {
  return {
    locale,
    v: computeTimelineGlobalVersion(plan, contextHash),
    batchVersions: computeTimelinePerBatchVersions(plan, contextHash),
    initialSectionIds: plan.initialGroups.map(group => group.sectionId),
    totalBatches: plan.totalBatches,
    targetBatchById: plan.targetBatchById,
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
  const base = `/search/home-timeline-batches/${locale}/${batchIndex}.json`
  return v ? `${base}?v=${v}` : base
}
