import type { APIRoute } from 'astro'
import { normalizeCharacterAliasKey, normalizeKeywordAliasKey } from '@commission-index/domain'
import { getCharacterAliases } from '@data/characterAliases'
import { getKeywordAliases } from '@data/keywordAliases'
import { HOME_LOCALES, normalizeHomeLocale } from '@features/home/i18n/homeLocale'
import { buildHomeCharacterBatchManifest } from '@features/home/server/homeCharacterBatchArtifacts'
import { buildHomeCharacterBatchPlan } from '@features/home/server/homeCharacterBatches'
import { buildSitePayload } from '@lib/home/buildSitePayload'
import { buildHomeSearchEntriesArtifact } from '@lib/pipeline/homeSearchEntries'
import { buildCommissionDataMap, buildCreatorAliasesMap } from '@lib/sitePayload'

export function getStaticPaths() {
  return HOME_LOCALES.map(locale => ({ params: { locale } }))
}

export const GET: APIRoute = async ({ params }) => {
  const locale = normalizeHomeLocale(params.locale)
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
  const creatorAliasesMap = buildCreatorAliasesMap(payload.creatorAliases)

  const plan = buildHomeCharacterBatchPlan({
    activeChars: payload.characterStatus.active,
    archivedChars: payload.characterStatus.archived,
    commissionMap,
  })
  const manifest = await buildHomeCharacterBatchManifest({
    characterAliasesMap,
    commissionMap,
    creatorAliasesMap,
    keywordAliasesMap,
    locale,
    plan,
    searchEntriesVersion: buildHomeSearchEntriesArtifact().version,
  })

  return new Response(`${JSON.stringify(manifest)}\n`, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
