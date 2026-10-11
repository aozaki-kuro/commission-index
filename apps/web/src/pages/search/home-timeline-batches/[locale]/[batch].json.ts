import type { APIRoute } from 'astro'
import { normalizeCharacterAliasKey, normalizeKeywordAliasKey } from '@commission-index/domain'
import { getCharacterAliases } from '@data/characterAliases'
import { getKeywordAliases } from '@data/keywordAliases'
import { HOME_LOCALES, normalizeHomeLocale } from '@features/home/i18n/homeLocale'
import { buildHomeTimelineBatchArtifacts } from '@features/home/server/homeTimelineBatchArtifacts'
import { buildHomeTimelineBatchPlan } from '@features/home/server/homeTimelineBatches'
import { buildSitePayload } from '@lib/home/buildSitePayload'
import { buildCreatorAliasesMap } from '@lib/sitePayload'

function getBatchPlan() {
  const payload = buildSitePayload()
  const characterAliases = getCharacterAliases()
  const keywordAliases = getKeywordAliases()

  const characterAliasesMap = new Map(
    characterAliases
      .map((row) => {
        const key = normalizeCharacterAliasKey(row.characterName)
        if (!key)
          return null
        return [key, row.aliases] as const
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )
  const keywordAliasesMap = new Map(
    keywordAliases
      .map((row) => {
        const key = normalizeKeywordAliasKey(row.baseKeyword)
        if (!key)
          return null
        return [key, row.aliases] as const
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry)),
  )

  return {
    characterAliasesMap,
    creatorAliasesMap: buildCreatorAliasesMap(payload.creatorAliases),
    keywordAliasesMap,
    plan: buildHomeTimelineBatchPlan({
      groups: payload.timelineGroups,
    }),
  }
}

export async function getStaticPaths() {
  const { characterAliasesMap, creatorAliasesMap, keywordAliasesMap, plan } = getBatchPlan()
  const paths: Array<{
    params: { batch: string, locale: string }
  }> = []

  for (const locale of HOME_LOCALES) {
    const artifacts = await buildHomeTimelineBatchArtifacts({
      characterAliasesMap,
      creatorAliasesMap,
      keywordAliasesMap,
      locale,
      plan,
    })
    for (const artifact of artifacts) {
      paths.push({
        params: {
          batch: `${artifact.batchIndex}.${artifact.version}`,
          locale,
        },
      })
    }
  }

  return paths
}

export const GET: APIRoute = async ({ params }) => {
  const locale = normalizeHomeLocale(params.locale)
  const [rawBatchIndex, ...versionParts] = (params.batch ?? '').split('.')
  const batchIndex = Number(rawBatchIndex)
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    return new Response(null, { status: 404 })
  }

  const { characterAliasesMap, creatorAliasesMap, keywordAliasesMap, plan } = getBatchPlan()
  const artifacts = await buildHomeTimelineBatchArtifacts({
    characterAliasesMap,
    creatorAliasesMap,
    keywordAliasesMap,
    locale,
    plan,
  })
  const artifact = artifacts[batchIndex]
  // A stale HTML page can request a version that no longer exists; answer 404 so the client
  // refreshes the manifest instead of receiving bytes cached under the wrong name.
  if (!artifact || (versionParts.length > 0 && versionParts.join('.') !== artifact.version)) {
    return new Response(null, { status: 404 })
  }

  return new Response(`${JSON.stringify(artifact.payload)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
