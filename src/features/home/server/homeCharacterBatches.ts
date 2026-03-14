import type { CharacterCommissions } from '#data/types'
import type { HomeLocale } from '#features/home/i18n/homeLocale'
import { getCharacterSectionId, getCharacterTitleId } from '#lib/characters/nav'
import { parseCommissionFileName } from '#lib/commissions'

export type HomeCharacterBatchStatus = 'active' | 'stale'

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
  stale: HomeCharacterBatchPlanGroup
}

export interface HomeCharacterBatchManifestGroup {
  initialSectionIds: string[]
  totalBatches: number
  targetBatchById: Record<string, number>
}

export interface HomeCharacterBatchManifest {
  locale: HomeLocale
  active: HomeCharacterBatchManifestGroup
  stale: HomeCharacterBatchManifestGroup
}

const ACTIVE_INITIAL_SECTION_COUNT = 1
const ACTIVE_BATCH_SIZE = 1
const STALE_FIRST_BATCH_SIZE = 1
const STALE_BATCH_SIZE = 1

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
      const sectionId = getCharacterSectionId(characterName)
      const titleId = getCharacterTitleId(characterName)
      targetBatchById[sectionId] = batchIndex
      targetBatchById[titleId] = batchIndex

      const commissions = commissionMap.get(characterName)?.Commissions ?? []
      commissions.forEach((commission) => {
        const { date } = parseCommissionFileName(commission.fileName)
        targetBatchById[`${sectionId}-${date}`] = batchIndex
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

function buildStaleBatchPlan({
  staleChars,
  commissionMap,
}: {
  staleChars: CharacterDisplay[]
  commissionMap: Map<string, CharacterCommissions>
}): HomeCharacterBatchPlanGroup {
  const staleCharacters = staleChars.map(item => item.DisplayName)
  const firstBatch = staleCharacters.slice(0, STALE_FIRST_BATCH_SIZE)
  const remainingCharacters = staleCharacters.slice(STALE_FIRST_BATCH_SIZE)
  const batches
    = firstBatch.length > 0 ? [firstBatch, ...chunk(remainingCharacters, STALE_BATCH_SIZE)] : []

  return {
    initialCharacters: [],
    batches,
    totalBatches: batches.length,
    targetBatchById: buildTargetBatchById({ batches, commissionMap }),
  }
}

export function buildHomeCharacterBatchPlan({
  activeChars,
  staleChars,
  commissionMap,
}: {
  activeChars: CharacterDisplay[]
  staleChars: CharacterDisplay[]
  commissionMap: Map<string, CharacterCommissions>
}): HomeCharacterBatchPlan {
  return {
    active: buildActiveBatchPlan({ activeChars, commissionMap }),
    stale: buildStaleBatchPlan({ staleChars, commissionMap }),
  }
}

export function buildHomeCharacterBatchManifest({
  locale,
  plan,
}: {
  locale: HomeLocale
  plan: HomeCharacterBatchPlan
}): HomeCharacterBatchManifest {
  return {
    locale,
    active: {
      initialSectionIds: plan.active.initialCharacters.map(getCharacterSectionId),
      totalBatches: plan.active.totalBatches,
      targetBatchById: plan.active.targetBatchById,
    },
    stale: {
      initialSectionIds: [],
      totalBatches: plan.stale.totalBatches,
      targetBatchById: plan.stale.targetBatchById,
    },
  }
}

export function buildHomeCharacterBatchUrl({
  batchIndex,
  locale,
  status,
}: {
  batchIndex: number
  locale: HomeLocale
  status: HomeCharacterBatchStatus
}) {
  return `/search/home-character-batches/${locale}/${status}/${batchIndex}.json`
}
