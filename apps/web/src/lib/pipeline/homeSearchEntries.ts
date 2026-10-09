import {
  buildCommissionSearchDomKey,
  buildCommissionSearchMetadata,
} from '@commission-index/domain'
import { getCharacterAliasesMap } from '../../../data/characterAliases'
import { getCommissionDataMap } from '../../../data/commissionData'
import { getCharacterRecords } from '../../../data/commissionRecords'
import { getCreatorAliasesMap } from '../../../data/creatorAliases'
import { getKeywordAliasesMap } from '../../../data/keywordAliases'
import { getCharacterSectionId } from '../characters/nav'

interface SearchEntry {
  publicId: string
  domKey: string
  searchText: string
  searchSuggest: string
}

export function buildHomeSearchEntries(): SearchEntry[] {
  const records = getCharacterRecords()
  const commissionMap = getCommissionDataMap()
  const characterAliasesMap = getCharacterAliasesMap()
  const creatorAliasesMap = getCreatorAliasesMap()
  const keywordAliasesMap = getKeywordAliasesMap()
  const orderedCharacters = [
    ...records.filter(record => record.status === 'active').map(record => record.name),
    ...records.filter(record => record.status === 'archived').map(record => record.name),
  ]
  const entries: SearchEntry[] = []

  for (const characterName of orderedCharacters) {
    const commissions = commissionMap.get(characterName)?.Commissions ?? []
    const sectionId = getCharacterSectionId(characterName)

    for (const commission of commissions) {
      const metadata = buildCommissionSearchMetadata({
        characterName,
        commissionDate: commission.commissionDate,
        creatorName: commission.creatorName,
        design: commission.Design,
        description: commission.Description,
        keyword: commission.Keyword,
        characterAliasesMap,
        creatorAliasesMap,
        keywordAliasesMap,
        creatorSuggestionMode: 'normalized',
        creatorSearchTextMode: 'normalized',
      })

      entries.push({
        publicId: commission.publicId,
        domKey: buildCommissionSearchDomKey(sectionId, commission.publicId),
        searchText: metadata.searchText,
        searchSuggest: metadata.searchSuggestionText,
      })
    }
  }

  return entries
}
