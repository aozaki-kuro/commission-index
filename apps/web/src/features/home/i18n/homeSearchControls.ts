type HomeSearchLocale = 'en' | 'zh-tw' | 'ja'

interface SearchHelpRow {
  syntax: string
  description: string
  example: string
}

export interface HomeSearchControls {
  searchPlaceholder: string
  searchCommissions: string
  searchHelp: string
  refreshPopularSearchLabel: string
  shuffleRandomEntryLabel: string
  clearSearch: string
  copySearchUrl: string
  searchUrlCopied: string
  searchUrlCopyFailed: string
  loadArchivedCharacters: string
  activeCharactersLoadFailed: string
  retryActiveCharactersLoad: string
  sourceCharacter: string
  sourceCreator: string
  sourceKeyword: string
  sourceDate: string
  sourcePrefix: string
  formatMatchCount: (count: number) => string
  formatSearchResultsStatus: (matchedCount: number, entriesCount: number) => string
  formatSearchClearedStatus: (entriesCount: number) => string
  formatHiddenArchivedResultsNotice: (count: number) => string
  searchHelpTitle: string
  searchHelpIntro: string
  searchHelpSyntaxHeader: string
  searchHelpMeaningHeader: string
  searchHelpExampleLabel: string
  searchHelpCombinedExampleLabel: string
  searchHelpAliasHint: string
  searchHelpClose: string
  searchHelpRows: SearchHelpRow[]
  surpriseMe: string
  surpriseMeRandom: string
  surpriseMeArtist: string
  surpriseMeYear: string
}

const DEFAULT_HOME_SEARCH_LOCALE: HomeSearchLocale = 'en'
const HOME_SEARCH_LOCALE_SET = new Set<HomeSearchLocale>(['en', 'zh-tw', 'ja'])

const HOME_SEARCH_CONTROLS: Record<HomeSearchLocale, HomeSearchControls> = {
  'en': {
    searchPlaceholder: 'Search',
    searchCommissions: 'Search commissions',
    searchHelp: 'Search help',
    refreshPopularSearchLabel: 'Refresh popular keywords',
    shuffleRandomEntryLabel: 'Shuffle',
    clearSearch: 'Clear search',
    copySearchUrl: 'Copy search URL',
    searchUrlCopied: 'Search URL copied',
    searchUrlCopyFailed: 'Failed to copy search URL.',
    loadArchivedCharacters: 'Load',
    activeCharactersLoadFailed: 'Could not load all commissions. Search results may be incomplete.',
    retryActiveCharactersLoad: 'Retry loading',
    sourceCharacter: 'character',
    sourceCreator: 'creator',
    sourceKeyword: 'keyword',
    sourceDate: 'date',
    sourcePrefix: 'in',
    formatMatchCount: count => `${count} ${count === 1 ? 'match' : 'matches'}`,
    formatSearchResultsStatus: (matchedCount, entriesCount) =>
      `Search results: ${matchedCount} of ${entriesCount} commissions shown.`,
    formatSearchClearedStatus: entriesCount =>
      `Search cleared. Showing all ${entriesCount} commissions.`,
    formatHiddenArchivedResultsNotice: count =>
      `${count} archived match${count === 1 ? '' : 'es'} hidden.`,
    searchHelpTitle: 'Search Help',
    searchHelpIntro: 'Type one or more keywords to filter commissions.',
    searchHelpSyntaxHeader: 'Syntax',
    searchHelpMeaningHeader: 'Meaning',
    searchHelpExampleLabel: 'Example',
    searchHelpCombinedExampleLabel: 'Combined example',
    searchHelpAliasHint:
      'Creator search also matches registered aliases (for example, romanized names).',
    searchHelpClose: 'Close',
    searchHelpRows: [
      {
        syntax: 'space',
        description: 'All terms must match',
        example: 'blue hair',
      },
      {
        syntax: '|',
        description: 'Either side can match',
        example: 'blue | silver',
      },
      {
        syntax: '!',
        description: 'Exclude a term',
        example: '!sketch',
      },
    ],
    surpriseMe: 'Surprise me',
    surpriseMeRandom: 'Random',
    surpriseMeArtist: 'By artist',
    surpriseMeYear: 'By year',
  },
  'zh-tw': {
    searchPlaceholder: '搜尋',
    searchCommissions: '搜尋委託',
    searchHelp: '搜尋說明',
    refreshPopularSearchLabel: '換一批熱門關鍵字',
    shuffleRandomEntryLabel: '隨機',
    clearSearch: '清除搜尋',
    copySearchUrl: '複製搜尋網址',
    searchUrlCopied: '已複製搜尋網址',
    searchUrlCopyFailed: '複製搜尋網址失敗。',
    loadArchivedCharacters: '載入',
    activeCharactersLoadFailed: '無法載入全部委託，搜尋結果可能不完整。',
    retryActiveCharactersLoad: '重試載入',
    sourceCharacter: '角色',
    sourceCreator: '繪師',
    sourceKeyword: '關鍵字',
    sourceDate: '日期',
    sourcePrefix: '於',
    formatMatchCount: count => `${count} 筆`,
    formatSearchResultsStatus: (matchedCount, entriesCount) =>
      `搜尋結果：顯示 ${matchedCount} / ${entriesCount} 筆委託。`,
    formatSearchClearedStatus: entriesCount => `已清除搜尋，顯示全部 ${entriesCount} 筆委託。`,
    formatHiddenArchivedResultsNotice: count => `另有 ${count} 筆停更結果未展開。`,
    searchHelpTitle: '搜尋說明',
    searchHelpIntro: '輸入一個或多個關鍵字來篩選委託。',
    searchHelpSyntaxHeader: '語法',
    searchHelpMeaningHeader: '說明',
    searchHelpExampleLabel: '範例',
    searchHelpCombinedExampleLabel: '組合範例',
    searchHelpAliasHint: '搜尋繪師時也會比對已登記別名（例如羅馬拼音）。',
    searchHelpClose: '關閉',
    searchHelpRows: [
      {
        syntax: 'space',
        description: '所有關鍵字都必須符合',
        example: 'blue hair',
      },
      {
        syntax: '|',
        description: '任一側符合即可',
        example: 'blue | silver',
      },
      {
        syntax: '!',
        description: '排除此關鍵字',
        example: '!sketch',
      },
    ],
    surpriseMe: '手氣不錯',
    surpriseMeRandom: '隨機',
    surpriseMeArtist: '同繪師',
    surpriseMeYear: '同年份',
  },
  'ja': {
    searchPlaceholder: '検索',
    searchCommissions: 'コミッションを検索',
    searchHelp: '検索ヘルプ',
    refreshPopularSearchLabel: '人気キーワードを更新',
    shuffleRandomEntryLabel: 'シャッフル',
    clearSearch: '検索をクリア',
    copySearchUrl: '検索URLをコピー',
    searchUrlCopied: '検索URLをコピーしました',
    searchUrlCopyFailed: '検索URLのコピーに失敗しました。',
    loadArchivedCharacters: '読み込む',
    activeCharactersLoadFailed: 'すべてのコミッションを読み込めませんでした。検索結果が不完全な可能性があります。',
    retryActiveCharactersLoad: '再読み込み',
    sourceCharacter: 'キャラクター',
    sourceCreator: '作者',
    sourceKeyword: 'キーワード',
    sourceDate: '日付',
    sourcePrefix: '対象',
    formatMatchCount: count => `${count}件`,
    formatSearchResultsStatus: (matchedCount, entriesCount) =>
      `検索結果：${entriesCount}件中 ${matchedCount}件を表示。`,
    formatSearchClearedStatus: entriesCount => `検索をクリアしました。全 ${entriesCount}件を表示。`,
    formatHiddenArchivedResultsNotice: count => `停止中の一致 ${count} 件が未展開です。`,
    searchHelpTitle: '検索ヘルプ',
    searchHelpIntro: '1つ以上のキーワードでコミッションを絞り込みます。',
    searchHelpSyntaxHeader: '構文',
    searchHelpMeaningHeader: '意味',
    searchHelpExampleLabel: '例',
    searchHelpCombinedExampleLabel: '組み合わせ例',
    searchHelpAliasHint: '作者検索では、登録済みの別名（例：ローマ字表記）にも一致します。',
    searchHelpClose: '閉じる',
    searchHelpRows: [
      {
        syntax: 'space',
        description: 'すべての語句が一致する必要があります',
        example: 'blue hair',
      },
      {
        syntax: '|',
        description: 'どちらか一方が一致すればOKです',
        example: 'blue | silver',
      },
      {
        syntax: '!',
        description: '語句を除外します',
        example: '!sketch',
      },
    ],
    surpriseMe: 'おまかせ',
    surpriseMeRandom: 'ランダム',
    surpriseMeArtist: '絵師別',
    surpriseMeYear: '年別',
  },
}

export function normalizeHomeSearchLocale(locale?: string | null): HomeSearchLocale {
  const normalized = locale?.toLowerCase() ?? DEFAULT_HOME_SEARCH_LOCALE
  return HOME_SEARCH_LOCALE_SET.has(normalized as HomeSearchLocale)
    ? (normalized as HomeSearchLocale)
    : DEFAULT_HOME_SEARCH_LOCALE
}

export function resolveHomeSearchControls(locale?: string | null) {
  return HOME_SEARCH_CONTROLS[normalizeHomeSearchLocale(locale)]
}
