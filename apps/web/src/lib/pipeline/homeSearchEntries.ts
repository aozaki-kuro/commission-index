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
import { contentHash } from '../utils/contentHash'

export interface SearchEntry {
  publicId: string
  domKey: string
  searchText: string
  searchSuggest: string
}

export interface HomeSearchEntriesArtifact {
  entries: SearchEntry[]
  /** Truncated SHA-256 of the serialized entries — names `/search/home-search-entries.<v>.json`. */
  version: string
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

let cachedArtifact: HomeSearchEntriesArtifact | null = null

export function clearHomeSearchEntriesArtifactCacheForTests() {
  cachedArtifact = null
}

/**
 * Entries plus their content hash. The manifest and the search-entries endpoint both read this so
 * the advertised filename and the served file cannot disagree.
 */
export function buildHomeSearchEntriesArtifact(): HomeSearchEntriesArtifact {
  if (cachedArtifact)
    return cachedArtifact

  const entries = buildHomeSearchEntries()
  cachedArtifact = {
    entries,
    version: contentHash(JSON.stringify(entries)),
  }
  return cachedArtifact
}
