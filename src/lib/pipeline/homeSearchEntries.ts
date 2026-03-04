import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getCommissionDataMap } from '../../../data/commissionData'
import { getCharacterRecords } from '../../../data/commissionRecords'
import { getCreatorAliasesMap } from '../../../data/creatorAliases'
import { getCharacterSectionId } from '../characters/nav'
import {
  buildCommissionSearchDomKey,
  buildCommissionSearchMetadata,
} from '../search/commissionSearchMetadata'
import { writeFileIfChanged } from './writeFileIfChanged'

type SearchEntry = {
  id: number
  domKey: string
  searchText: string
  searchSuggest: string
}

const buildHomeSearchEntries = (): SearchEntry[] => {
  const records = getCharacterRecords()
  const commissionMap = getCommissionDataMap()
  const creatorAliasesMap = getCreatorAliasesMap()
  const orderedCharacters = [
    ...records.filter(record => record.status === 'active').map(record => record.name),
    ...records.filter(record => record.status === 'stale').map(record => record.name),
  ]
  const entries: SearchEntry[] = []
  let nextId = 0

  for (const characterName of orderedCharacters) {
    const commissions = commissionMap.get(characterName)?.Commissions ?? []
    const sectionId = getCharacterSectionId(characterName)

    for (const commission of commissions) {
      const metadata = buildCommissionSearchMetadata({
        characterName,
        fileName: commission.fileName,
        design: commission.Design,
        description: commission.Description,
        keyword: commission.Keyword,
        creatorAliasesMap,
        creatorSuggestionMode: 'normalized',
        creatorSearchTextMode: 'normalized',
      })

      entries.push({
        id: nextId,
        domKey: buildCommissionSearchDomKey(sectionId, commission.fileName),
        searchText: metadata.searchText,
        searchSuggest: metadata.searchSuggestionText,
      })
      nextId += 1
    }
  }

  return entries
}

const outputPath = path.join(process.cwd(), 'public', 'search', 'home-search-entries.json')

export const generateHomeSearchEntriesFile = async () => {
  const entries = buildHomeSearchEntries()
  await mkdir(path.dirname(outputPath), { recursive: true })
  const payload = `${JSON.stringify(entries, null, 2)}\n`
  const result = await writeFileIfChanged(outputPath, payload)
  const relativeOutputPath = path.relative(process.cwd(), outputPath)

  if (result === 'unchanged') {
    console.log(`Home search entries unchanged (${entries.length}) -> ${relativeOutputPath}`)
  } else {
    console.log(`Generated ${entries.length} home search entries -> ${relativeOutputPath}`)
  }
}
