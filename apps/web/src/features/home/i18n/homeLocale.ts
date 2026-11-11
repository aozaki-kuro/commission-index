import { DEFAULT_WEB_LOCALE, normalizeWebLocale, WEB_LOCALES } from '../../../config/locales'

export const HOME_LOCALES = WEB_LOCALES
export type HomeLocale = (typeof HOME_LOCALES)[number]

export const DEFAULT_HOME_LOCALE: HomeLocale = DEFAULT_WEB_LOCALE

export interface HomeLocaleOption {
  locale: HomeLocale
  label: string
  href: string
}

export interface HomeLocaleMessages {
  lang: string
  localeLabel: string
  localeSwitcherLabel: string
  meta: {
    title: string
    description: string
  }
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
    browseKeywordsButton: string
    backToTop: string
    byCharacter: string
    byDate: string
    closeNavigationMenu: string
    openNavigationMenu: string
    loadArchivedCharacters: string
    archivedCharactersCollapsedTitle: string
    archivedCharactersCollapsedHint: string
    activeCharacters: string
    archivedCharacters: string
    browseArtists: string
    timelineTitle: string
    noActiveCharacters: string
    noArchivedCharacters: string
    formatCollapsedArchivedSummary: (characterCount: number, commissionCount: number) => string
  }
}

const HOME_LOCALE_MESSAGES: Record<HomeLocale, HomeLocaleMessages> = {
  'en': {
    lang: 'en',
    localeLabel: 'English',
    localeSwitcherLabel: 'Language',
    meta: {
      title: 'Commission Index',
      description: 'The collection of commissioned NSFW illustrations / Do Not Repost',
    },
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
      noActiveUpdatesFound: 'No recent commissions',
      lastUpdate: 'Last update:',
      formatTotalCommissions: count => `Currently ${count} commissions`,
    },
    footer: {
      rightsLines: [
        'The copyright of all art works commissioned on Skeb belongs to the artist and the proper copyright holders.',
      ],
      obscuredNames: 'Some character names are obscured due to platform rules.',
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
      contentLine1: 'You must be 18 or older to view this site.',
      contentLine2: 'If you are under 18, please leave now.',
      confirmAge: 'I am over 18',
      leaveNow: 'Leave Now',
    },
    controls: {
      search: 'Search',
      browseKeywordsButton: 'Browse keywords',
      backToTop: 'Back to top',
      byCharacter: 'By Character',
      byDate: 'By Date',
      closeNavigationMenu: 'Close navigation menu',
      openNavigationMenu: 'Open navigation menu',
      loadArchivedCharacters: 'Show archived',
      archivedCharactersCollapsedTitle: 'Archived characters stay folded by default',
      archivedCharactersCollapsedHint: 'Expand only when you want to browse the older entries.',
      activeCharacters: 'Active',
      archivedCharacters: 'Archived',
      browseArtists: 'Artists',
      timelineTitle: 'Timeline',
      noActiveCharacters: 'No active characters.',
      noArchivedCharacters: 'No archived characters.',
      formatCollapsedArchivedSummary: (characterCount, commissionCount) =>
        `${characterCount} Archived Character${characterCount === 1
          ? ''
          : 's'} / ${commissionCount} commission${commissionCount === 1
          ? ''
          : 's'}`,
    },
  },
  'zh-tw': {
    lang: 'zh-Hant-TW',
    localeLabel: '繁體中文',
    localeSwitcherLabel: '語言',
    meta: {
      title: '委託索引',
      description: '委託繪製的 NSFW 插畫收藏／請勿轉載',
    },
    description: {
      heading: '委託索引',
      introductionTitle: '介紹',
      previewTextBeforeRss:
        '預覽圖片會與其原始發布平台的連結一同顯示，例如 Twitter、Pixiv 或 Fantia（若有）。點擊連結即可前往原始貼文查看完整圖片。網站更新亦可透過 ',
      previewTextAfterRss: ' 訂閱。',
      rssLinkLabel: 'RSS',
      supportIllustratorsText:
        '我並非插畫師，而是經常委託創作的人。如果你喜歡這些作品，歡迎關注並支持各位插畫師。',
      contactTextBeforeOdaibako: '若插畫師或讀者希望聯絡，歡迎透過 ',
      odaibakoLinkLabel: 'odaibako',
      contactTextBetweenLinks: ' 或 ',
      emailLinkLabel: '電子郵件',
      contactTextAfterEmail: '與我聯繫。關於插畫公開或再分發的相關請求恕不回應。',
    },
    update: {
      noActiveUpdatesFound: '近期沒有新的委託',
      lastUpdate: '最近更新：',
      formatTotalCommissions: count => `目前共 ${count} 筆委託`,
    },
    footer: {
      rightsLines: [
        '依據服務條款，透過 Skeb 委託的作品之所有權利歸屬於創作者與原作權利方。',
      ],
      obscuredNames: '部分角色名稱因平台規定而遮蔽。',
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
      browseKeywordsButton: '瀏覽關鍵字',
      backToTop: '回到頂部',
      byCharacter: '依角色',
      byDate: '依日期',
      closeNavigationMenu: '關閉導覽選單',
      openNavigationMenu: '開啟導覽選單',
      loadArchivedCharacters: '顯示停更角色',
      archivedCharactersCollapsedTitle: '停更角色預設會先收起',
      archivedCharactersCollapsedHint: '想查看較舊的委託時，再展開即可。',
      activeCharacters: '活躍角色',
      archivedCharacters: '停更角色',
      browseArtists: '繪師',
      timelineTitle: '時間軸',
      noActiveCharacters: '目前沒有活躍角色。',
      noArchivedCharacters: '目前沒有停更角色。',
      formatCollapsedArchivedSummary: (characterCount, commissionCount) =>
        `${characterCount} 位停更角色 / ${commissionCount} 筆委託`,
    },
  },
  'ja': {
    lang: 'ja',
    localeLabel: '日本語',
    localeSwitcherLabel: '言語',
    meta: {
      title: 'コミッション一覧',
      description: '依頼して描いていただいた NSFW イラストのコレクション／無断転載禁止',
    },
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
      noActiveUpdatesFound: '最近のコミッションはありません',
      lastUpdate: '最終更新：',
      formatTotalCommissions: count => `現在 ${count} 件のコミッション`,
    },
    footer: {
      rightsLines: [
        '利用規約により、Skeb で依頼された作品のすべての権利はクリエイターおよび版権元に帰属します。',
      ],
      obscuredNames: '一部のキャラクター名はプラットフォームの規約により伏せています。',
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
      contentLine2: '18 歳未満の方は今すぐ退出してください。',
      confirmAge: '18歳以上です',
      leaveNow: '退出する',
    },
    controls: {
      search: '検索',
      browseKeywordsButton: 'キーワード一覧',
      backToTop: '先頭へ戻る',
      byCharacter: 'キャラクター別',
      byDate: '日付別',
      closeNavigationMenu: 'ナビゲーションメニューを閉じる',
      openNavigationMenu: 'ナビゲーションメニューを開く',
      loadArchivedCharacters: '停止中を表示',
      archivedCharactersCollapsedTitle: '停止中のキャラクターは初期状態で折りたたみ表示です',
      archivedCharactersCollapsedHint: '過去のコミッションを見たいときだけ展開できます。',
      activeCharacters: '活動中キャラクター',
      archivedCharacters: '停止中キャラクター',
      browseArtists: '絵師',
      timelineTitle: 'タイムライン',
      noActiveCharacters: '活動中のキャラクターはありません。',
      noArchivedCharacters: '停止中のキャラクターはありません。',
      formatCollapsedArchivedSummary: (characterCount, commissionCount) =>
        `停止中キャラクター ${characterCount} 人 / コミッション ${commissionCount} 件`,
    },
  },
}

export const normalizeHomeLocale: (locale?: string | null) => HomeLocale = normalizeWebLocale

export function getHomeLocaleMessages(locale?: string | null) {
  return HOME_LOCALE_MESSAGES[normalizeHomeLocale(locale)]
}

export const HOME_LOCALE_SWITCH_ITEMS = HOME_LOCALES.map(locale => ({
  locale,
  label: HOME_LOCALE_MESSAGES[locale].localeLabel,
}))
