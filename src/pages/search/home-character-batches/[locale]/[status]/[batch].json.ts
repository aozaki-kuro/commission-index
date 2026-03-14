import type { HomeCharacterBatchStatus } from '#features/home/server/homeCharacterBatches'
import type { APIRoute } from 'astro'
import { getCharacterAliases } from '#data/characterAliases'
import { getKeywordAliases } from '#data/keywordAliases'
import { HOME_LOCALES, normalizeHomeLocale } from '#features/home/i18n/homeLocale'
import {
  buildHomeCharacterBatchPlan,

} from '#features/home/server/homeCharacterBatches'
import { buildHomeCharacterBatchPayload } from '#features/home/server/homeCharacterBatchPayload'
import { normalizeCharacterAliasKey } from '#lib/characterAliases/shared'
import { buildSitePayload } from '#lib/home/buildSitePayload'
import { normalizeKeywordAliasKey } from '#lib/keywordAliases/shared'
import { buildCommissionDataMap, buildCreatorAliasesMap } from '#lib/sitePayload'

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
      staleChars: payload.characterStatus.stale,
      commissionMap,
    }),
  }
}

export function getStaticPaths() {
  const { plan } = getBatchPlan()
  const paths: Array<{
    params: { batch: string, locale: string, status: HomeCharacterBatchStatus }
  }> = []

  for (const locale of HOME_LOCALES) {
    for (const status of ['active', 'stale'] as const) {
      for (let batchIndex = 0; batchIndex < plan[status].totalBatches; batchIndex += 1) {
        paths.push({
          params: {
            batch: String(batchIndex),
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
  const status = params.status === 'stale' ? 'stale' : 'active'
  const batchIndex = Number(params.batch)
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    return new Response(null, { status: 404 })
  }

  const { characterAliasesMap, commissionMap, creatorAliasesMap, keywordAliasesMap, plan }
    = getBatchPlan()
  const characters = plan[status].batches[batchIndex]
  if (!characters) {
    return new Response(null, { status: 404 })
  }

  const payload = await buildHomeCharacterBatchPayload({
    batchIndex,
    characterAliasesMap,
    characters,
    commissionMap,
    creatorAliasesMap,
    keywordAliasesMap,
    locale,
    status,
  })

  return new Response(`${JSON.stringify(payload)}\n`, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
