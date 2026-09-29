import type { CharacterCommissions } from '@data/types'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import { getCharacterSectionId, getCharacterTitleId } from '@lib/characters/nav'
import { hashString } from '@lib/utils/hash'

export type HomeCharacterBatchStatus = 'active' | 'archived'

interface CharacterDisplay {
  DisplayName: string
}

export interface HomeCharacterBatchPlanGroup {
  initialCharacters: string[]
  batches: string[][]
  totalBatches: number
  targetBatchById: Record<string, number>
}

export interface HomeCharacterBatchPlan {
  active: HomeCharacterBatchPlanGroup
  archived: HomeCharacterBatchPlanGroup
}

export interface HomeCharacterBatchManifestGroup {
  initialSectionIds: string[]
  totalBatches: number
  targetBatchById: Record<string, number>
  /** Per-batch content hashes for cache-busting. Index matches batch index. */
  batchVersions?: string[]
}

export interface HomeCharacterBatchManifest {
  locale: HomeLocale
  /** Global content hash — covers all commissions. Used by search entries URL. */
  v?: string
  active: HomeCharacterBatchManifestGroup
  archived: HomeCharacterBatchManifestGroup
}

const ACTIVE_INITIAL_SECTION_COUNT = 1
const ACTIVE_BATCH_SIZE = 1
const ARCHIVED_FIRST_BATCH_SIZE = 1
const ARCHIVED_BATCH_SIZE = 1

function chunk(values: string[], batchSize: number) {
  if (values.length === 0)
    return []

  const batches: string[][] = []
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize))
  }
  return batches
}

function buildTargetBatchById({
  batches,
  commissionMap,
}: {
  batches: string[][]
  commissionMap: Map<string, CharacterCommissions>
}) {
  const targetBatchById: Record<string, number> = {}

  batches.forEach((characters, batchIndex) => {
    characters.forEach((characterName) => {
      const commissions = commissionMap.get(characterName)?.Commissions ?? []
      if (commissions.length === 0)
        return

      const sectionId = getCharacterSectionId(characterName)
      const titleId = getCharacterTitleId(characterName)
      targetBatchById[sectionId] = batchIndex
      targetBatchById[titleId] = batchIndex
      commissions.forEach((commission) => {
        targetBatchById[`${sectionId}-commission-${commission.id}`] = batchIndex
        const compactDate = commission.commissionDate?.replaceAll('-', '')
        if (compactDate) {
          targetBatchById[`${sectionId}-${compactDate}`] = batchIndex
        }
      })
    })
  })

  return targetBatchById
}

function buildActiveBatchPlan({
  activeChars,
  commissionMap,
}: {
  activeChars: CharacterDisplay[]
  commissionMap: Map<string, CharacterCommissions>
}): HomeCharacterBatchPlanGroup {
  const initialCharacters = activeChars
    .slice(0, ACTIVE_INITIAL_SECTION_COUNT)
    .map(item => item.DisplayName)
  const deferredCharacters = activeChars
    .slice(ACTIVE_INITIAL_SECTION_COUNT)
    .map(item => item.DisplayName)
  const batches = chunk(deferredCharacters, ACTIVE_BATCH_SIZE)

  return {
    initialCharacters,
    batches,
    totalBatches: batches.length,
    targetBatchById: buildTargetBatchById({ batches, commissionMap }),
  }
}

function buildArchivedBatchPlan({
  archivedChars,
  commissionMap,
}: {
  archivedChars: CharacterDisplay[]
  commissionMap: Map<string, CharacterCommissions>
}): HomeCharacterBatchPlanGroup {
  const archivedCharacters = archivedChars.map(item => item.DisplayName)
  const firstBatch = archivedCharacters.slice(0, ARCHIVED_FIRST_BATCH_SIZE)
  const remainingCharacters = archivedCharacters.slice(ARCHIVED_FIRST_BATCH_SIZE)
  const batches
    = firstBatch.length > 0 ? [firstBatch, ...chunk(remainingCharacters, ARCHIVED_BATCH_SIZE)] : []

  return {
    initialCharacters: [],
    batches,
    totalBatches: batches.length,
    targetBatchById: buildTargetBatchById({ batches, commissionMap }),
  }
}

export function buildHomeCharacterBatchPlan({
  activeChars,
  archivedChars,
  commissionMap,
}: {
  activeChars: CharacterDisplay[]
  archivedChars: CharacterDisplay[]
  commissionMap: Map<string, CharacterCommissions>
}): HomeCharacterBatchPlan {
  return {
    active: buildActiveBatchPlan({ activeChars, commissionMap }),
    archived: buildArchivedBatchPlan({ archivedChars, commissionMap }),
  }
}

function serializeCommissionsForHash(
  characters: string[],
  commissionMap: Map<string, CharacterCommissions>,
) {
  // Include character names so renames also invalidate the cache (they affect sectionId, titleId, anchors).
  return characters.map(name => [name, commissionMap.get(name)?.Commissions ?? []])
}

function computePerBatchVersions(
  batches: string[][],
  commissionMap: Map<string, CharacterCommissions>,
  contextHash?: string,
): string[] {
  const prefix = contextHash ?? ''
  return batches.map(characters =>
    hashString(prefix + JSON.stringify(serializeCommissionsForHash(characters, commissionMap))),
  )
}

function computeGlobalVersion(
  plan: HomeCharacterBatchPlan,
  commissionMap: Map<string, CharacterCommissions>,
  contextHash?: string,
): string {
  const allCharacters = [
    ...plan.active.initialCharacters,
    ...plan.active.batches.flat(),
    ...plan.archived.batches.flat(),
  ]
  return hashString((contextHash ?? '') + JSON.stringify(serializeCommissionsForHash(allCharacters, commissionMap)))
}

export function buildHomeCharacterBatchManifest({
  commissionMap,
  contextHash,
  locale,
  plan,
}: {
  commissionMap: Map<string, CharacterCommissions>
  /** Pre-computed hash of non-commission inputs (aliases, labels) that affect batch JSON content. */
  contextHash?: string
  locale: HomeLocale
  plan: HomeCharacterBatchPlan
}): HomeCharacterBatchManifest {
  return {
    locale,
    v: computeGlobalVersion(plan, commissionMap, contextHash),
    active: {
      initialSectionIds: plan.active.initialCharacters.map(getCharacterSectionId),
      totalBatches: plan.active.totalBatches,
      targetBatchById: plan.active.targetBatchById,
      batchVersions: computePerBatchVersions(plan.active.batches, commissionMap, contextHash),
    },
    archived: {
      initialSectionIds: [],
      totalBatches: plan.archived.totalBatches,
      targetBatchById: plan.archived.targetBatchById,
      batchVersions: computePerBatchVersions(plan.archived.batches, commissionMap, contextHash),
    },
  }
}

export function buildHomeCharacterBatchUrl({
  batchIndex,
  locale,
  status,
  v,
}: {
  batchIndex: number
  locale: HomeLocale
  status: HomeCharacterBatchStatus
  v?: string
}) {
  const base = `/search/home-character-batches/${locale}/${status}/${batchIndex}.json`
  return v ? `${base}?v=${v}` : base
}
