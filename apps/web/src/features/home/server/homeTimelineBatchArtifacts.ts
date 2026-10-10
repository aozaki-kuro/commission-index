import type { HomeTimelineBatchPayload } from '@features/home/commission/batch/homeTimelineBatchPayload'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import type {
  HomeTimelineBatchManifest,
  HomeTimelineBatchPlan,
} from './homeTimelineBatches'
import { contentHash } from '@lib/utils/contentHash'
import { buildHomeTimelineBatchPayload } from './homeTimelineBatchPayload'

export interface HomeTimelineBatchArtifact {
  batchIndex: number
  payload: HomeTimelineBatchPayload
  /** Truncated SHA-256 of the final serialized payload — names the immutable batch file. */
  version: string
}

interface TimelineArtifactsInput {
  characterAliasesMap: Map<string, string[]> | null
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  plan: HomeTimelineBatchPlan
}

// The manifest (component + manifest endpoint) and the batch endpoint must agree on every version,
// so they all go through this builder. Memoizing by a content signature means a build renders the
// payload (and its images) once per locale even though three call sites ask for it.
const artifactsCache = new Map<string, Promise<HomeTimelineBatchArtifact[]>>()

function buildCacheKey({ characterAliasesMap, creatorAliasesMap, keywordAliasesMap, locale, plan }: TimelineArtifactsInput) {
  return contentHash(JSON.stringify([
    locale,
    plan.batches.map(groups => groups.map(group => [
      group.yearKey,
      group.sectionId,
      group.entries.map(entry => [entry.character, entry.commission]),
    ])),
    [...(characterAliasesMap ?? [])],
    [...(creatorAliasesMap ?? [])],
    [...(keywordAliasesMap ?? [])],
  ]))
}

export function clearHomeTimelineBatchArtifactsCacheForTests() {
  artifactsCache.clear()
}

export function buildHomeTimelineBatchArtifacts(
  input: TimelineArtifactsInput,
): Promise<HomeTimelineBatchArtifact[]> {
  const key = buildCacheKey(input)
  const cached = artifactsCache.get(key)
  if (cached)
    return cached

  const build = Promise.all(
    input.plan.batches.map(async (groups, batchIndex) => {
      const payload = await buildHomeTimelineBatchPayload({
        batchIndex,
        characterAliasesMap: input.characterAliasesMap,
        creatorAliasesMap: input.creatorAliasesMap,
        groups,
        keywordAliasesMap: input.keywordAliasesMap,
        locale: input.locale,
      })

      return {
        batchIndex,
        payload,
        version: contentHash(JSON.stringify(payload)),
      }
    }),
  )

  artifactsCache.set(key, build)
  return build
}

export async function buildHomeTimelineBatchManifest({
  characterAliasesMap,
  creatorAliasesMap,
  keywordAliasesMap,
  locale,
  plan,
  searchEntriesVersion,
}: {
  characterAliasesMap: Map<string, string[]> | null
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  plan: HomeTimelineBatchPlan
  /** Version of the sibling search index (`buildHomeSearchEntriesArtifact`) — the manifest's `v`. */
  searchEntriesVersion: string
}): Promise<HomeTimelineBatchManifest> {
  const artifacts = await buildHomeTimelineBatchArtifacts({
    characterAliasesMap,
    creatorAliasesMap,
    keywordAliasesMap,
    locale,
    plan,
  })

  return {
    locale,
    v: searchEntriesVersion,
    batchVersions: artifacts.map(artifact => artifact.version),
    initialSectionIds: plan.initialGroups.map(group => group.sectionId),
    totalBatches: plan.totalBatches,
    targetBatchById: plan.targetBatchById,
  }
}
