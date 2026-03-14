import type { CharacterCommissions, Commission } from '#data/types'
import type {
  HomeCharacterBatchEntryPayload,
  HomeCharacterBatchPayload,
  HomeCharacterBatchSectionPayload,
} from '#features/home/commission/homeCharacterBatchPayload'
import type { HomeLocale } from '#features/home/i18n/homeLocale'
import type { HomeCharacterBatchStatus } from './homeCharacterBatches'
import {
  COMMISSION_LINK_TEXT_CLASS,
  selectDisplayLinks,
} from '#features/home/commission/linkDisplay'
import { getHomeLocaleMessages } from '#features/home/i18n/homeLocale'
import {
  getCharacterSectionHash,
  getCharacterSectionId,
  getCharacterTitleId,
} from '#lib/characters/nav'
import { parseCommissionFileName } from '#lib/commissions'
import { parseAndFormatDate } from '#lib/date/format'
import { resolveSourceImageByCommissionFileName } from '#lib/images/sourceImageRegistry'
import {
  buildCommissionSearchDomKey,
  buildCommissionSearchMetadata,
} from '#lib/search/commissionSearchMetadata'
import { getBaseFileName } from '#lib/utils/strings'
import { getImage } from 'astro:assets'

const COMMISSION_IMAGE_WIDTH = 1280
const COMMISSION_IMAGE_SIZES = '(max-width: 768px) 92vw, 640px'

function buildInterestPayload({
  interestKey,
  locale,
}: {
  interestKey: string
  locale: HomeLocale
}) {
  const listing = getHomeLocaleMessages(locale).listing

  return {
    key: interestKey,
    label: listing.wantThis,
    title: listing.wantThisTitle,
    recordedLabel: listing.wantThisRecorded,
    recordedTitle: listing.wantThisRecordedTitle,
  }
}

async function buildImagePayload(commission: Commission) {
  const sourceImage = resolveSourceImageByCommissionFileName(commission.fileName)
  if (!sourceImage)
    return null

  const image = await getImage({
    src: sourceImage,
    widths: [768, 960, 1280],
    width: COMMISSION_IMAGE_WIDTH,
    format: 'webp',
    sizes: COMMISSION_IMAGE_SIZES,
  })

  return {
    src: image.src,
    srcSet: image.srcSet.attribute,
    sizes: COMMISSION_IMAGE_SIZES,
    width: Number(image.attributes.width ?? COMMISSION_IMAGE_WIDTH),
    height: Number(image.attributes.height ?? sourceImage.height),
  }
}

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
  const { date, year, creator } = parseCommissionFileName(commission.fileName)
  const copyrightCreator = creator ? getBaseFileName(creator).trim() || creator : 'Anonymous'
  const altText = `© ${year} ${copyrightCreator} & Crystallize`
  const image = await buildImagePayload(commission)
  const searchKey = buildCommissionSearchDomKey(sectionId, commission.fileName)
  const metadata = buildCommissionSearchMetadata({
    characterName,
    fileName: commission.fileName,
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
  const interestKey = `${sectionId}-${date}`

  return {
    id: `${sectionId}-${date}`,
    sectionId,
    searchKey,
    searchText: metadata.searchText,
    searchSuggest: metadata.searchSuggestionText,
    altText,
    image,
    sourceImageNotFoundText: messages.listing.sourceImageNotFound,
    timeLabel: parseAndFormatDate(date, 'yyyy/MM/dd'),
    primaryText,
    secondaryText,
    links,
    interest: links.length > 0 ? null : buildInterestPayload({ interestKey, locale }),
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
  const entries = await Promise.all(
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
