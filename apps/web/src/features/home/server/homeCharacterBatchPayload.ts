import type { CharacterCommissions, Commission } from '@data/types'
import type {
  HomeCharacterBatchEntryPayload,
  HomeCharacterBatchPayload,
  HomeCharacterBatchSectionPayload,
} from '@features/home/commission/batch/homeCharacterBatchPayload'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import type { HomeCharacterBatchStatus } from './homeCharacterBatches'
import {
  COMMISSION_LINK_TEXT_CLASS,
  selectDisplayLinks,
} from '@features/home/commission/linkDisplay'
import { getHomeLocaleMessages } from '@features/home/i18n/homeLocale'
import {
  getCharacterSectionHash,
  getCharacterSectionId,
  getCharacterTitleId,
} from '@lib/characters/nav'
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
}): Promise<HomeCharacterBatchEntryPayload> {
  const messages = getHomeLocaleMessages(locale)
  const compactDate = commission.commissionDate?.replaceAll('-', '') ?? ''
  const year = commission.commissionDate?.slice(0, 4) ?? ''
  const creator = commission.creatorName?.trim() ?? ''
  const copyrightCreator = creator || 'Anon'
  const altText = year
    ? `© ${year} ${copyrightCreator} & Crystallize`
    : `${copyrightCreator} & Crystallize`
  const image = await buildImagePayload(commission)
  const searchKey = buildCommissionSearchDomKey(sectionId, commission.publicId)
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
  const hasDescription = Boolean(commission.Description)
  const primaryText = creator || 'Anon'
  const partLabel = commission.partNumber == null ? null : `Part ${commission.partNumber}`
  const secondaryText = hasDescription ? quotedDescription : null
  const interestKey = compactDate
    ? `${sectionId}-${compactDate}`
    : `${sectionId}-commission-${commission.publicId}`

  return {
    id: `${sectionId}-commission-${commission.publicId}`,
    legacyAnchorId: compactDate ? `${sectionId}-${compactDate}` : null,
    sectionId,
    searchKey,
    searchText: metadata.searchText,
    searchSuggest: metadata.searchSuggestionText,
    altText,
    image,
    sourceImageNotFoundText: messages.listing.sourceImageNotFound,
    timeLabel: compactDate ? parseAndFormatDate(compactDate, 'yyyy/MM/dd') : '',
    primaryText,
    partLabel,
    secondaryText,
    links,
    interest: displayLinks.mainLinks.length > 0 ? null : buildInterestPayload({ interestKey, locale }),
  }
}

async function buildSectionPayload({
  characterAliasesMap,
  characterName,
  commissionMap,
  creatorAliasesMap,
  keywordAliasesMap,
  locale,
  status,
}: {
  characterAliasesMap: Map<string, string[]> | null
  characterName: string
  commissionMap: Map<string, CharacterCommissions>
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  status: HomeCharacterBatchStatus
}): Promise<HomeCharacterBatchSectionPayload> {
  const messages = getHomeLocaleMessages(locale)
  const sectionId = getCharacterSectionId(characterName)
  const commissions = commissionMap.get(characterName)?.Commissions ?? []
  const entriesWithLegacyAnchors = await Promise.all(
    commissions.map(commission =>
      buildEntryPayload({
        characterAliasesMap,
        characterName,
        commission,
        creatorAliasesMap,
        keywordAliasesMap,
        locale,
        sectionId,
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
    displayName: characterName,
    status,
    sectionId,
    titleId: getCharacterTitleId(characterName),
    sectionHash: getCharacterSectionHash(characterName),
    totalCommissions: commissions.length,
    toBeAnnouncedText: messages.listing.toBeAnnounced,
    entries,
  }
}

export async function buildHomeCharacterBatchPayload({
  batchIndex,
  characterAliasesMap,
  characters,
  commissionMap,
  creatorAliasesMap,
  keywordAliasesMap,
  locale,
  status,
}: {
  batchIndex: number
  characterAliasesMap: Map<string, string[]> | null
  characters: string[]
  commissionMap: Map<string, CharacterCommissions>
  creatorAliasesMap: Map<string, string[]> | null
  keywordAliasesMap: Map<string, string[]> | null
  locale: HomeLocale
  status: HomeCharacterBatchStatus
}): Promise<HomeCharacterBatchPayload> {
  const sections = await Promise.all(
    characters.map(characterName =>
      buildSectionPayload({
        characterAliasesMap,
        characterName,
        commissionMap,
        creatorAliasesMap,
        keywordAliasesMap,
        locale,
        status,
      }),
    ),
  )

  return {
    batchIndex,
    sections,
    status,
  }
}

export { COMMISSION_IMAGE_SIZES, COMMISSION_LINK_TEXT_CLASS }
