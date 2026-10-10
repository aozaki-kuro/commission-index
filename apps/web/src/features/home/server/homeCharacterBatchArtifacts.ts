import type { CharacterCommissions } from '@data/types'
import type { HomeCharacterBatchPayload } from '@features/home/commission/batch/homeCharacterBatchPayload'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import type {
  HomeCharacterBatchManifest,
  HomeCharacterBatchPlan,
  HomeCharacterBatchStatus,
} from './homeCharacterBatches'
import { getCharacterSectionId } from '@lib/characters/nav'
import { contentHash } from '@lib/utils/contentHash'
import { buildHomeCharacterBatchPayload } from './homeCharacterBatchPayload'

export interface HomeCharacterBatchArtifact {
  batchIndex: number
  characters: string[]
  payload: HomeCharacterBatchPayload
  /** Truncated SHA-256 of the final serialized payload — names the immutable batch file. */
  version: string
}

interface CharacterArtifactsInput {
  characterAliasesMap: Map<string, string[]> | null
  commissionMap: Map<string, CharacterCommissions>
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  plan: HomeCharacterBatchPlan
  status: HomeCharacterBatchStatus
}

// The manifest (component + manifest endpoint) and the batch endpoint must agree on every version,
// so they all go through this builder. Memoizing by a content signature means a build renders the
// payload (and its images) once per locale/status even though three call sites ask for it.
const artifactsCache = new Map<string, Promise<HomeCharacterBatchArtifact[]>>()

function buildCacheKey({ characterAliasesMap, commissionMap, creatorAliasesMap, keywordAliasesMap, locale, plan, status }: CharacterArtifactsInput) {
  const batches = plan[status].batches
  return contentHash(JSON.stringify([
    locale,
    status,
    batches.map(batch => batch.map(name => [name, commissionMap.get(name)?.Commissions ?? []])),
    [...(characterAliasesMap ?? [])],
    [...(creatorAliasesMap ?? [])],
    [...(keywordAliasesMap ?? [])],
  ]))
}

export function clearHomeCharacterBatchArtifactsCacheForTests() {
  artifactsCache.clear()
}

export function buildHomeCharacterBatchArtifacts(
  input: CharacterArtifactsInput,
): Promise<HomeCharacterBatchArtifact[]> {
  const key = buildCacheKey(input)
  const cached = artifactsCache.get(key)
  if (cached)
    return cached

  const characters = input.plan[input.status].batches
  const build = Promise.all(
    characters.map(async (batchCharacters, batchIndex) => {
      const payload = await buildHomeCharacterBatchPayload({
        batchIndex,
        characterAliasesMap: input.characterAliasesMap,
        characters: batchCharacters,
        commissionMap: input.commissionMap,
        creatorAliasesMap: input.creatorAliasesMap,
        keywordAliasesMap: input.keywordAliasesMap,
        locale: input.locale,
        status: input.status,
      })

      return {
        batchIndex,
        characters: batchCharacters,
        payload,
        version: contentHash(JSON.stringify(payload)),
      }
    }),
  )

  artifactsCache.set(key, build)
  return build
}

export async function buildHomeCharacterBatchManifest({
  characterAliasesMap,
  commissionMap,
  creatorAliasesMap,
  keywordAliasesMap,
  locale,
  plan,
  searchEntriesVersion,
}: {
  characterAliasesMap: Map<string, string[]> | null
  commissionMap: Map<string, CharacterCommissions>
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  plan: HomeCharacterBatchPlan
  /** Version of the sibling search index (`buildHomeSearchEntriesArtifact`) — the manifest's `v`. */
  searchEntriesVersion: string
}): Promise<HomeCharacterBatchManifest> {
  const [activeArtifacts, archivedArtifacts] = await Promise.all([
    buildHomeCharacterBatchArtifacts({
      characterAliasesMap,
      commissionMap,
      creatorAliasesMap,
      keywordAliasesMap,
      locale,
      plan,
      status: 'active',
    }),
    buildHomeCharacterBatchArtifacts({
      characterAliasesMap,
      commissionMap,
      creatorAliasesMap,
      keywordAliasesMap,
      locale,
      plan,
      status: 'archived',
    }),
  ])
  // The search index is a sibling immutable file whose version is supplied by its own builder,
  // so the advertised filename and the served file cannot disagree.

  return {
    locale,
    v: searchEntriesVersion,
    active: {
      initialSectionIds: plan.active.initialCharacters.map(getCharacterSectionId),
      totalBatches: plan.active.totalBatches,
      targetBatchById: plan.active.targetBatchById,
      batchVersions: activeArtifacts.map(artifact => artifact.version),
    },
    archived: {
      initialSectionIds: [],
      totalBatches: plan.archived.totalBatches,
      targetBatchById: plan.archived.targetBatchById,
      batchVersions: archivedArtifacts.map(artifact => artifact.version),
    },
  }
}
