import type { HomeLocale } from '#features/home/i18n/homeLocale'

interface HomeCopy {
  siteTitle: string
  introductionTitle: string
  descriptionParagraphs: [string, string, string]
  supportLinePrefix: string
  supportLinkLabel: string
  contactLinkLabel: string
  contactConnector: string
  contactLineSuffix: string
  footerNotice: string
  footerCopyright: string
  footerCharacterNames: string
  footerNoIndex: string
}

export const homeCopyByLocale: Record<HomeLocale, HomeCopy> = {
  en: {
    siteTitle: 'Commission Index',
    introductionTitle: 'Introduction',
    descriptionParagraphs: [
      'Preview images are displayed alongside their corresponding links to platforms like Twitter, Pixiv, or Fantia when available. By clicking on these links, you can view the full image. You can also subscribe for updates through',
      'I am not an illustrator but someone who frequently commissions artworks. If you appreciate the illustrations, please consider following and supporting the illustrators.',
      "If any illustrators or readers wish to get in touch, don't hesitate to reach out through",
    ],
    supportLinePrefix: 'You may also consider',
    supportLinkLabel: 'supporting my commission projects',
    contactLinkLabel: 'Email',
    contactConnector: 'or',
    contactLineSuffix:
      'Please note that requests regarding release or redistribution of the illustrations will be ignored.',
    footerNotice:
      'Under the terms, all rights to works commissioned on Skeb belong to creators and relevant right holders.',
    footerCopyright:
      'The copyright of all artworks commissioned on Skeb belongs to the artist and the proper copyright holders.',
    footerCharacterNames: 'Some character names are obscured due to platform rule requirements.',
    footerNoIndex: 'This site has restricted search engines from indexing.',
  },
  ja: {
    siteTitle: 'コミッション索引',
    introductionTitle: '紹介',
    descriptionParagraphs: [
      'プレビュー画像には、可能な範囲で Twitter、Pixiv、Fantia などへのリンクを添えています。リンクからフルサイズ画像を閲覧できます。更新通知は',
      '私はイラストレーターではなく、主に依頼する側の人間です。作品を気に入っていただけたら、ぜひイラストレーターのフォローや支援をご検討ください。',
      'イラストレーターの方・閲覧者の方で連絡をご希望の場合は、',
    ],
    supportLinePrefix: 'あわせて、',
    supportLinkLabel: '私の依頼プロジェクトを支援',
    contactLinkLabel: 'メール',
    contactConnector: 'または',
    contactLineSuffix: 'なお、イラストの公開・配布に関するご要望には対応していません。',
    footerNotice:
      '規約に基づき、Skeb で依頼・制作された作品の権利はクリエイターおよび正当な権利者に帰属します。',
    footerCopyright:
      'Skeb で依頼されたすべての作品の著作権は、アーティストおよび適切な権利者に帰属します。',
    footerCharacterNames: '規約上の要件により、一部のキャラクター名を伏せています。',
    footerNoIndex: 'このサイトは検索エンジンによるインデックスを制限しています。',
  },
  'zh-Hant': {
    siteTitle: '委託索引',
    introductionTitle: '介紹',
    descriptionParagraphs: [
      '預覽圖片會在可用時附上對應連結（如 Twitter、Pixiv、Fantia）。點擊連結即可查看完整圖片；你也可以透過',
      '我不是繪師，而是經常委託創作的人。若你喜歡這些作品，也歡迎追蹤並支持各位繪師。',
      '若繪師或讀者希望聯絡，歡迎透過',
    ],
    supportLinePrefix: '你也可以考慮',
    supportLinkLabel: '支持我的委託企劃',
    contactLinkLabel: '電子郵件',
    contactConnector: '或',
    contactLineSuffix: '另外，關於圖片公開或散布的請求將不予回應。',
    footerNotice: '依照條款，所有在 Skeb 委託之作品相關權利皆歸創作者與合法權利人所有。',
    footerCopyright: '在 Skeb 委託的所有作品，其著作權歸藝術家與相關權利持有人所有。',
    footerCharacterNames: '基於規範要求，部分角色名稱已做遮蔽處理。',
    footerNoIndex: '本站已限制搜尋引擎收錄。',
  },
}
