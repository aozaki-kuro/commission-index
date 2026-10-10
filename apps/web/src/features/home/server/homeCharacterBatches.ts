import type { CharacterCommissions } from '@data/types'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import { getCharacterSectionId, getCharacterTitleId } from '@lib/characters/nav'

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
  /** Content-hash of each final serialized payload; names the immutable batch file. Index matches batch index. */
  batchVersions?: string[]
}

export interface HomeCharacterBatchManifest {
  locale: HomeLocale
  /** Content-hash of the serialized search index — names `/search/home-search-entries.<v>.json`. */
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
        targetBatchById[`${sectionId}-commission-${commission.publicId}`] = batchIndex
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
  const base = `/search/home-character-batches/${locale}/${status}/${batchIndex}`
  return v ? `${base}.${v}.json` : `${base}.json`
}
