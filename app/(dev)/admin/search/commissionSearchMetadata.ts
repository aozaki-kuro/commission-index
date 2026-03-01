import type { CommissionRow } from '#lib/admin/db'
import { buildCommissionSearchMetadata } from '#lib/search/commissionSearchMetadata'

export interface AdminCommissionSearchMetadata {
  searchText: string
  searchSuggestionText: string
}

const includeFileNameInSearchText = (baseSearchText: string, fileName: string) =>
  `${baseSearchText} ${fileName}`.toLowerCase()

export const buildAdminCommissionSearchMetadata = (
  characterName: string,
  commission: CommissionRow,
  creatorAliasesMap: Map<string, string[]>,
): AdminCommissionSearchMetadata => {
  const metadata = buildCommissionSearchMetadata({
    characterName,
    fileName: commission.fileName,
    design: commission.design,
    description: commission.description,
    keyword: commission.keyword,
    creatorAliasesMap,
    creatorSuggestionMode: 'raw',
    creatorSearchTextMode: 'raw',
  })

  return {
    searchText: includeFileNameInSearchText(metadata.searchText, commission.fileName),
    searchSuggestionText: metadata.searchSuggestionText,
  }
}
