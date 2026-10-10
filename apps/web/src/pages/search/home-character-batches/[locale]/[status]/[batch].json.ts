import type { HomeCharacterBatchStatus } from '@features/home/server/homeCharacterBatches'
import type { APIRoute } from 'astro'
import { getCharacterAliases } from '@data/characterAliases'
import { getKeywordAliases } from '@data/keywordAliases'
import { HOME_LOCALES, normalizeHomeLocale } from '@features/home/i18n/homeLocale'
import { buildHomeCharacterBatchArtifacts } from '@features/home/server/homeCharacterBatchArtifacts'
import {
  buildHomeCharacterBatchPlan,

} from '@features/home/server/homeCharacterBatches'
import { normalizeCharacterAliasKey } from '@lib/characterAliases'
import { buildSitePayload } from '@lib/home/buildSitePayload'
import { normalizeKeywordAliasKey } from '@lib/keywordAliases'
import { buildCommissionDataMap, buildCreatorAliasesMap } from '@lib/sitePayload'

function getBatchPlan() {
  const payload = buildSitePayload()
  const commissionMap = buildCommissionDataMap(payload.commissionData)
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
    commissionMap,
    creatorAliasesMap: buildCreatorAliasesMap(payload.creatorAliases),
    keywordAliasesMap,
    plan: buildHomeCharacterBatchPlan({
      activeChars: payload.characterStatus.active,
      archivedChars: payload.characterStatus.archived,
      commissionMap,
    }),
  }
}

export async function getStaticPaths() {
  const { characterAliasesMap, commissionMap, creatorAliasesMap, keywordAliasesMap, plan }
    = getBatchPlan()
  const paths: Array<{
    params: { batch: string, locale: string, status: HomeCharacterBatchStatus }
  }> = []

  for (const locale of HOME_LOCALES) {
    for (const status of ['active', 'archived'] as const) {
      const artifacts = await buildHomeCharacterBatchArtifacts({
        characterAliasesMap,
        commissionMap,
        creatorAliasesMap,
        keywordAliasesMap,
        locale,
        plan,
        status,
      })
      for (const artifact of artifacts) {
        paths.push({
          params: {
            batch: `${artifact.batchIndex}.${artifact.version}`,
            locale,
            status,
          },
        })
      }
    }
  }

  return paths
}

export const GET: APIRoute = async ({ params }) => {
  const locale = normalizeHomeLocale(params.locale)
  const status = params.status === 'archived' ? 'archived' : 'active'
  const [rawBatchIndex, ...versionParts] = (params.batch ?? '').split('.')
  const batchIndex = Number(rawBatchIndex)
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    return new Response(null, { status: 404 })
  }

  const { characterAliasesMap, commissionMap, creatorAliasesMap, keywordAliasesMap, plan }
    = getBatchPlan()
  const artifacts = await buildHomeCharacterBatchArtifacts({
    characterAliasesMap,
    commissionMap,
    creatorAliasesMap,
    keywordAliasesMap,
    locale,
    plan,
    status,
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
