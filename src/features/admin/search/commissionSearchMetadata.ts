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
  commission: Pick<CommissionRow, 'fileName' | 'design' | 'description' | 'keyword'>,
  creatorAliasesMap: Map<string, string[]>,
  keywordAliasesMap?: Map<string, string[]>,
): AdminCommissionSearchMetadata => {
  const metadata = buildCommissionSearchMetadata({
    characterName,
    fileName: commission.fileName,
    design: commission.design,
    description: commission.description,
    keyword: commission.keyword,
    creatorAliasesMap,
    keywordAliasesMap,
    creatorSuggestionMode: 'raw',
    creatorSearchTextMode: 'raw',
  })

  return {
    searchText: includeFileNameInSearchText(metadata.searchText, commission.fileName),
    searchSuggestionText: metadata.searchSuggestionText,
  }
}
