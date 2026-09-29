import type { Commission } from '@data/types'
import type {
  HomeTimelineBatchEntryPayload,
  HomeTimelineBatchPayload,
  HomeTimelineBatchSectionPayload,
} from '@features/home/commission/batch/homeTimelineBatchPayload'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import type { TimelineYearGroup } from '@lib/commissions/timeline'
import {
  COMMISSION_LINK_TEXT_CLASS,
  selectDisplayLinks,
} from '@features/home/commission/linkDisplay'
import { getHomeLocaleMessages } from '@features/home/i18n/homeLocale'
import { getCharacterSectionId } from '@lib/characters/nav'
import { parseAndFormatDate } from '@lib/date/format'
import {
  buildCommissionSearchDomKey,
  buildCommissionSearchMetadata,
} from '@lib/search/commissionSearchMetadata'
import { buildImagePayload, buildInterestPayload, COMMISSION_IMAGE_SIZES } from './batchPayloadBuilder'

async function buildEntryPayload({
  characterAliasesMap,
  characterName,
  commission,
  creatorAliasesMap,
  keywordAliasesMap,
  locale,
  sectionId,
}: {
  characterAliasesMap: Map<string, string[]> | null
  characterName: string
  commission: Commission
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  sectionId: string
}): Promise<HomeTimelineBatchEntryPayload> {
  const messages = getHomeLocaleMessages(locale)
  const entryAnchorPrefix = getCharacterSectionId(characterName)
  const compactDate = commission.commissionDate?.replaceAll('-', '') ?? ''
  const year = commission.commissionDate?.slice(0, 4) ?? ''
  const creator = commission.creatorName?.trim() ?? ''
  const copyrightCreator = creator || 'Anonymous'
  const altText = year
    ? `© ${year} ${copyrightCreator} & Crystallize`
    : `${copyrightCreator} & Crystallize`
  const image = await buildImagePayload(commission)
  const searchKey = buildCommissionSearchDomKey(entryAnchorPrefix, commission.id)
  const metadata = buildCommissionSearchMetadata({
    characterName,
    commissionDate: commission.commissionDate,
    creatorName: commission.creatorName,
    design: commission.Design,
    description: commission.Description,
    keyword: commission.Keyword,
    characterAliasesMap: characterAliasesMap ?? undefined,
    creatorAliasesMap: creatorAliasesMap ?? undefined,
    keywordAliasesMap: keywordAliasesMap ?? undefined,
    creatorSuggestionMode: 'normalized',
    creatorSearchTextMode: 'normalized',
  })
  const quotedDescription = commission.Description ? `"${commission.Description}"` : ''
  const displayLinks = selectDisplayLinks({
    links: commission.Links,
    designLink: commission.Design,
  })
  const links = [
    ...displayLinks.mainLinks.map(link => ({
      label: link.type,
      url: link.url,
    })),
    ...(displayLinks.designLink
      ? [
          {
            label: messages.listing.designLink,
            url: displayLinks.designLink,
          },
        ]
      : []),
  ]
  const hasCreator = Boolean(creator)
  const hasDescription = Boolean(commission.Description)
  const primaryText = hasCreator ? creator : hasDescription ? quotedDescription : '-'
  const secondaryText = hasCreator && hasDescription ? quotedDescription : null
  const interestKey = compactDate
    ? `${entryAnchorPrefix}-${compactDate}`
    : `${entryAnchorPrefix}-commission-${commission.id}`

  return {
    id: `${entryAnchorPrefix}-commission-${commission.id}`,
    legacyAnchorId: compactDate ? `${entryAnchorPrefix}-${compactDate}` : null,
    sectionId,
    searchKey,
    searchText: metadata.searchText,
    searchSuggest: metadata.searchSuggestionText,
    altText,
    image,
    sourceImageNotFoundText: messages.listing.sourceImageNotFound,
    timeLabel: compactDate ? parseAndFormatDate(compactDate, 'yyyy/MM/dd') : '',
    primaryText,
    secondaryText,
    links,
    interest: displayLinks.mainLinks.length > 0 ? null : buildInterestPayload({ interestKey, locale }),
  }
}

async function buildSectionPayload({
  characterAliasesMap,
  creatorAliasesMap,
  group,
  keywordAliasesMap,
  locale,
}: {
  characterAliasesMap: Map<string, string[]> | null
  creatorAliasesMap: Map<string, string[]> | null
  group: TimelineYearGroup
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
}): Promise<HomeTimelineBatchSectionPayload> {
  const entriesWithLegacyAnchors = await Promise.all(
    group.entries.map(({ character, commission }) =>
      buildEntryPayload({
        characterAliasesMap,
        characterName: character,
        commission,
        creatorAliasesMap,
        keywordAliasesMap,
        locale,
        sectionId: group.sectionId,
      }),
    ),
  )
  const usedLegacyAnchors = new Set<string>()
  const entries = entriesWithLegacyAnchors.map((entry) => {
    if (!entry.legacyAnchorId || !usedLegacyAnchors.has(entry.legacyAnchorId)) {
      if (entry.legacyAnchorId) {
        usedLegacyAnchors.add(entry.legacyAnchorId)
      }
      return entry
    }

    return { ...entry, legacyAnchorId: null }
  })

  return {
    yearKey: group.yearKey,
    sectionId: group.sectionId,
    titleId: group.titleId,
    sectionHash: group.navItem.sectionHash,
    totalCommissions: group.entries.length,
    entries,
  }
}

export async function buildHomeTimelineBatchPayload({
  batchIndex,
  characterAliasesMap,
  creatorAliasesMap,
  groups,
  keywordAliasesMap,
  locale,
}: {
  batchIndex: number
  characterAliasesMap: Map<string, string[]> | null
  creatorAliasesMap: Map<string, string[]> | null
  groups: TimelineYearGroup[]
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
}): Promise<HomeTimelineBatchPayload> {
  const sections = await Promise.all(
    groups.map(group =>
      buildSectionPayload({
        characterAliasesMap,
        creatorAliasesMap,
        group,
        keywordAliasesMap,
        locale,
      }),
    ),
  )

  return {
    batchIndex,
    sections,
  }
}

export { COMMISSION_IMAGE_SIZES, COMMISSION_LINK_TEXT_CLASS }
