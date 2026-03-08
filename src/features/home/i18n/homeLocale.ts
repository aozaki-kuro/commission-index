export const HOME_LOCALES = ['en', 'zh-tw', 'ja'] as const
export type HomeLocale = (typeof HOME_LOCALES)[number]

export const DEFAULT_HOME_LOCALE: HomeLocale = 'en'

export interface HomeLocaleOption {
  locale: HomeLocale
  label: string
  href: string
}

const HOME_LOCALE_SET = new Set<string>(HOME_LOCALES)

type SearchHelpRow = {
  syntax: string
  description: string
  example: string
}

export interface HomeLocaleMessages {
  lang: string
  localeLabel: string
  localeSwitcherLabel: string
  description: {
    heading: string
    introductionTitle: string
    previewTextBeforeRss: string
    previewTextAfterRss: string
    rssLinkLabel: string
    supportIllustratorsText: string
    contactTextBeforeOdaibako: string
    odaibakoLinkLabel: string
    contactTextBetweenLinks: string
    emailLinkLabel: string
    contactTextAfterEmail: string
  }
  update: {
    noActiveUpdatesFound: string
    lastUpdate: string
    formatTotalCommissions: (count: number) => string
  }
  footer: {
    rightsLines: string[]
    obscuredNames: string
    noIndexing: string
  }
  listing: {
    toBeAnnounced: string
    sourceImageNotFound: string
    designLink: string
    wantThis: string
    wantThisTitle: string
    wantThisRecorded: string
    wantThisRecordedTitle: string
  }
  warning: {
    title: string
    srDescription: string
    contentLine1: string
    contentLine2: string
    confirmAge: string
    leaveNow: string
  }
  controls: {
    search: string
    searchPlaceholder: string
    searchCommissions: string
    searchHelp: string
    refreshPopularSearchLabel: string
    clearSearch: string
    copySearchUrl: string
    searchUrlCopied: string
    searchUrlCopyFailed: string
    byCharacter: string
    byDate: string
    view: string
    closeNavigationMenu: string
    openNavigationMenu: string
    loadingCharacters: string
    loadingYears: string
    loadStaleCharacters: string
    staleCharactersCollapsedTitle: string
    staleCharactersCollapsedHint: string
    activeCharacters: string
    staleCharacters: string
    noActiveCharacters: string
    noStaleCharacters: string
    sourceCharacter: string
    sourceCreator: string
    sourceKeyword: string
    sourceDate: string
    sourcePrefix: string
    formatCollapsedStaleSummary: (characterCount: number, commissionCount: number) => string
    formatMatchCount: (count: number) => string
    formatSearchResultsStatus: (matchedCount: number, entriesCount: number) => string
    formatSearchClearedStatus: (entriesCount: number) => string
    formatHiddenStaleResultsNotice: (count: number) => string
    searchHelpTitle: string
    searchHelpIntro: string
    searchHelpSyntaxHeader: string
    searchHelpMeaningHeader: string
    searchHelpExampleLabel: string
    searchHelpCombinedExampleLabel: string
    searchHelpAliasHint: string
    searchHelpClose: string
    searchHelpRows: SearchHelpRow[]
  }
}

const HOME_LOCALE_MESSAGES: Record<HomeLocale, HomeLocaleMessages> = {
  en: {
    lang: 'en',
    localeLabel: 'English',
    localeSwitcherLabel: 'Language',
    description: {
      heading: 'Commission Index',
      introductionTitle: 'Introduction',
      previewTextBeforeRss:
        'Preview images are shown together with links to the original posts on platforms such as Twitter, Pixiv, or Fantia when available. Clicking the link will open the original post where the full image can be viewed. You may also subscribe to updates via ',
      previewTextAfterRss: '.',
      rssLinkLabel: 'RSS',
      supportIllustratorsText:
        'I am not an illustrator but someone who frequently commissions artworks. If you appreciate the illustrations, please consider following and supporting the illustrators.',
      contactTextBeforeOdaibako:
        'If any illustrators or readers wish to get in touch, feel free to reach out via ',
      odaibakoLinkLabel: 'odaibako',
      contactTextBetweenLinks: ' or ',
      emailLinkLabel: 'email',
      contactTextAfterEmail:
        '. Requests regarding the release or distribution of the illustrations will not receive a response.',
    },
    update: {
      noActiveUpdatesFound: 'No active updates found',
      lastUpdate: 'Last update:',
      formatTotalCommissions: count => `Currently ${count} commissions`,
    },
    footer: {
      rightsLines: [
        'The copyright of all art works commissioned on Skeb belongs to the artist and the proper copyright holders.',
      ],
      obscuredNames: 'Some character names are obscured due to rule requirements.',
      noIndexing: 'This site has restricted search engines from indexing.',
    },
    listing: {
      toBeAnnounced: 'To be announced ...',
      sourceImageNotFound: 'Source image not found',
      designLink: 'Design',
      wantThis: 'Want this',
      wantThisTitle: 'Record interest in this unpublished commission',
      wantThisRecorded: 'Recorded',
      wantThisRecordedTitle: 'Already recorded',
    },
    warning: {
      title: '[ Warning ]',
      srDescription: 'Age confirmation required before viewing the full content.',
      contentLine1: 'You have to be over 18 to view the contents.',
      contentLine2: 'Please leave now if you are under 18.',
      confirmAge: 'I am over 18',
      leaveNow: 'Leave Now',
    },
    controls: {
      search: 'Search',
      searchPlaceholder: 'Search',
      searchCommissions: 'Search commissions',
      searchHelp: 'Search help',
      refreshPopularSearchLabel: 'Refresh popular keywords',
      clearSearch: 'Clear search',
      copySearchUrl: 'Copy search URL',
      searchUrlCopied: 'Search URL copied',
      searchUrlCopyFailed: 'Failed to copy search URL.',
      byCharacter: 'By Character',
      byDate: 'By Date',
      view: 'View',
      closeNavigationMenu: 'Close navigation menu',
      openNavigationMenu: 'Open navigation menu',
      loadingCharacters: 'Loading characters...',
      loadingYears: 'Loading years...',
      loadStaleCharacters: 'Load stale characters',
      staleCharactersCollapsedTitle: 'Archived characters stay folded by default',
      staleCharactersCollapsedHint: 'Expand only when you want to browse the older entries.',
      activeCharacters: 'Active Characters',
      staleCharacters: 'Stale Characters',
      noActiveCharacters: 'No active characters.',
      noStaleCharacters: 'No stale characters.',
      sourceCharacter: 'character',
      sourceCreator: 'creator',
      sourceKeyword: 'keyword',
      sourceDate: 'date',
      sourcePrefix: 'in',
      formatCollapsedStaleSummary: (characterCount, commissionCount) =>
        `${characterCount} Stale Character${characterCount === 1 ? '' : 's'} / ${commissionCount} commission${commissionCount === 1 ? '' : 's'}`,
      formatMatchCount: count => `${count} ${count === 1 ? 'match' : 'matches'}`,
      formatSearchResultsStatus: (matchedCount, entriesCount) =>
        `Search results: ${matchedCount} of ${entriesCount} commissions shown.`,
      formatSearchClearedStatus: entriesCount =>
        `Search cleared. Showing all ${entriesCount} commissions.`,
      formatHiddenStaleResultsNotice: count =>
        `${count} matching stale commission${count === 1 ? ' is' : 's are'} hidden.`,
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
    },
  },
  'zh-tw': {
    lang: 'zh-Hant-TW',
    localeLabel: '繁體中文',
    localeSwitcherLabel: '語言',
    description: {
      heading: '委託索引',
      introductionTitle: '介紹',
      previewTextBeforeRss:
        '預覽圖片會與其原始發布平台的連結一同顯示，例如 Twitter、Pixiv 或 Fantia（若有）。點擊連結即可前往原始貼文查看完整圖片。網站更新亦可透過 ',
      previewTextAfterRss: ' 訂閱。',
      rssLinkLabel: 'RSS',
      supportIllustratorsText:
        '本人並非插畫師，而是經常委託創作的一方。如果你喜歡這些作品，歡迎關注並支持各位插畫師。',
      contactTextBeforeOdaibako: '若插畫師或讀者希望聯絡，歡迎透過 ',
      odaibakoLinkLabel: 'odaibako',
      contactTextBetweenLinks: ' 或 ',
      emailLinkLabel: '電子郵件',
      contactTextAfterEmail: '與我聯繫。關於插畫公開或再分發的相關請求將不予回應。',
    },
    update: {
      noActiveUpdatesFound: '目前沒有活躍更新',
      lastUpdate: '最近更新：',
      formatTotalCommissions: count => `目前共 ${count} 筆委託`,
    },
    footer: {
      rightsLines: [
        '依據服務條款，透過 Skeb 委託的作品之全部權利均歸創作者與原作權利方所有。',
        '在 Skeb 上委託的所有作品，其著作權歸屬於繪師與合法權利人。',
      ],
      obscuredNames: '部分角色名稱因規範要求而做遮蔽。',
      noIndexing: '本站已限制搜尋引擎索引。',
    },
    listing: {
      toBeAnnounced: '待公開 ...',
      sourceImageNotFound: '找不到原始圖片',
      designLink: '設計稿',
      wantThis: '想看這張',
      wantThisTitle: '記錄你對此未公開委託的興趣',
      wantThisRecorded: '已記錄',
      wantThisRecordedTitle: '已記錄過',
    },
    warning: {
      title: '[ 警告 ]',
      srDescription: '查看完整內容前需要年齡確認。',
      contentLine1: '你必須年滿 18 歲才能瀏覽內容。',
      contentLine2: '若未滿 18 歲，請立即離開。',
      confirmAge: '我已滿 18 歲',
      leaveNow: '立即離開',
    },
    controls: {
      search: '搜尋',
      searchPlaceholder: '搜尋',
      searchCommissions: '搜尋委託',
      searchHelp: '搜尋說明',
      refreshPopularSearchLabel: '換一批熱門關鍵字',
      clearSearch: '清除搜尋',
      copySearchUrl: '複製搜尋網址',
      searchUrlCopied: '已複製搜尋網址',
      searchUrlCopyFailed: '複製搜尋網址失敗。',
      byCharacter: '依角色',
      byDate: '依日期',
      view: '檢視',
      closeNavigationMenu: '關閉導覽選單',
      openNavigationMenu: '開啟導覽選單',
      loadingCharacters: '載入角色中...',
      loadingYears: '載入年份中...',
      loadStaleCharacters: '載入停更角色',
      staleCharactersCollapsedTitle: '停更角色預設會先收起',
      staleCharactersCollapsedHint: '想查看較舊的委託時，再展開即可。',
      activeCharacters: '活躍角色',
      staleCharacters: '停更角色',
      noActiveCharacters: '目前沒有活躍角色。',
      noStaleCharacters: '目前沒有停更角色。',
      sourceCharacter: '角色',
      sourceCreator: '繪師',
      sourceKeyword: '關鍵字',
      sourceDate: '日期',
      sourcePrefix: '於',
      formatCollapsedStaleSummary: (characterCount, commissionCount) =>
        `${characterCount} 位停更角色 / ${commissionCount} 筆委託`,
      formatMatchCount: count => `${count} 筆`,
      formatSearchResultsStatus: (matchedCount, entriesCount) =>
        `搜尋結果：顯示 ${matchedCount} / ${entriesCount} 筆委託。`,
      formatSearchClearedStatus: entriesCount => `已清除搜尋，顯示全部 ${entriesCount} 筆委託。`,
      formatHiddenStaleResultsNotice: count => `另有 ${count} 筆命中的停更委託尚未展開。`,
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
    },
  },
  ja: {
    lang: 'ja',
    localeLabel: '日本語',
    localeSwitcherLabel: '言語',
    description: {
      heading: 'コミッション一覧',
      introductionTitle: '紹介',
      previewTextBeforeRss:
        'プレビュー画像には、可能な場合、Twitter・Pixiv・Fantia など各プラットフォームの元投稿へのリンクが併せて表示されています。リンクをクリックすると、元の投稿でフルサイズの画像を閲覧できます。更新情報は ',
      previewTextAfterRss: ' から購読することも可能です。',
      rssLinkLabel: 'RSS',
      supportIllustratorsText:
        '私はイラストレーターではなく、主にイラストを依頼している立場の者です。作品を気に入っていただけましたら、ぜひイラストレーターのフォローや支援をご検討ください。',
      contactTextBeforeOdaibako: 'イラストレーターの方、または読者の方でご連絡がある場合は、',
      odaibakoLinkLabel: 'odaibako',
      contactTextBetweenLinks: ' または ',
      emailLinkLabel: 'メール',
      contactTextAfterEmail:
        'からお気軽にご連絡ください。なお、イラストの公開や配布に関するご要望には対応いたしかねます。',
    },
    update: {
      noActiveUpdatesFound: '現在、更新はありません',
      lastUpdate: '最終更新：',
      formatTotalCommissions: count => `現在 ${count} 件のコミッション`,
    },
    footer: {
      rightsLines: [
        '規約による、Skeb でやり取りされた作品のすべての権利はクリエイターと版権元に帰属する。',
      ],
      obscuredNames: '一部のキャラクター名は規約上の理由で伏せています。',
      noIndexing: 'このサイトは検索エンジンによるインデックスを制限しています。',
    },
    listing: {
      toBeAnnounced: '公開予定 ...',
      sourceImageNotFound: '元画像が見つかりません',
      designLink: 'デザイン',
      wantThis: '見たい',
      wantThisTitle: '未公開コミッションへの関心を記録する',
      wantThisRecorded: '記録済み',
      wantThisRecordedTitle: '記録済みです',
    },
    warning: {
      title: '[ 警告 ]',
      srDescription: '閲覧前に年齢確認が必要です。',
      contentLine1: '閲覧には 18 歳以上である必要があります。',
      contentLine2: '18 歳未満の方は今すぐ離脱してください。',
      confirmAge: '18歳以上です',
      leaveNow: '離脱する',
    },
    controls: {
      search: '検索',
      searchPlaceholder: '検索',
      searchCommissions: 'コミッションを検索',
      searchHelp: '検索ヘルプ',
      refreshPopularSearchLabel: '人気キーワードを更新',
      clearSearch: '検索をクリア',
      copySearchUrl: '検索URLをコピー',
      searchUrlCopied: '検索URLをコピーしました',
      searchUrlCopyFailed: '検索URLのコピーに失敗しました。',
      byCharacter: 'キャラクター別',
      byDate: '日付別',
      view: '表示',
      closeNavigationMenu: 'ナビゲーションメニューを閉じる',
      openNavigationMenu: 'ナビゲーションメニューを開く',
      loadingCharacters: 'キャラクターを読み込み中...',
      loadingYears: '年別一覧を読み込み中...',
      loadStaleCharacters: '停止中キャラクターを読み込む',
      staleCharactersCollapsedTitle: '停止中キャラクターは初期表示では折りたたまれます',
      staleCharactersCollapsedHint: '過去のコミッションを見たいときだけ展開できます。',
      activeCharacters: '進行中キャラクター',
      staleCharacters: '停止中キャラクター',
      noActiveCharacters: '進行中のキャラクターはありません。',
      noStaleCharacters: '停止中のキャラクターはありません。',
      sourceCharacter: 'キャラクター',
      sourceCreator: '作者',
      sourceKeyword: 'キーワード',
      sourceDate: '日付',
      sourcePrefix: '対象',
      formatCollapsedStaleSummary: (characterCount, commissionCount) =>
        `${characterCount}人の停止中キャラクター / ${commissionCount}件のコミッション`,
      formatMatchCount: count => `${count}件`,
      formatSearchResultsStatus: (matchedCount, entriesCount) =>
        `検索結果：${entriesCount}件中 ${matchedCount}件を表示。`,
      formatSearchClearedStatus: entriesCount =>
        `検索をクリアしました。全 ${entriesCount}件を表示。`,
      formatHiddenStaleResultsNotice: count =>
        `一致した停止中コミッションが未展開のまま ${count} 件あります。`,
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
    },
  },
}

export const normalizeHomeLocale = (locale?: string | null): HomeLocale => {
  const normalized = locale?.toLowerCase() ?? DEFAULT_HOME_LOCALE
  return HOME_LOCALE_SET.has(normalized) ? (normalized as HomeLocale) : DEFAULT_HOME_LOCALE
}

export const getHomeLocaleMessages = (locale?: string | null) =>
  HOME_LOCALE_MESSAGES[normalizeHomeLocale(locale)]

export const resolveHomeLocaleMessages = (locale?: string | null) => getHomeLocaleMessages(locale)

export const resolveHomeControls = (locale?: string | null) =>
  resolveHomeLocaleMessages(locale).controls

export const HOME_LOCALE_SWITCH_ITEMS = HOME_LOCALES.map(locale => ({
  locale,
  label: HOME_LOCALE_MESSAGES[locale].localeLabel,
}))
