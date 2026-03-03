import AppLink from '#components/shared/AppLink'

interface CreateLinksProps {
  links: string[]
  designLink?: string
}

export const COMMISSION_LINK_TEXT_CLASS = 'select-none underline underline-offset-2'

/**
 * 对 URL 进行清理和标准化处理。
 * @param url 要清理的链接字符串
 * @returns 清理后的链接字符串（如将 x.com 替换为 twitter.com）
 */
const sanitizeUrl = (url: string): string =>
  url.includes('x.com') ? url.replace('x.com', 'twitter.com') : url

/** 链接优先级及匹配模式 */
const LINK_PRIORITY = [
  { type: 'Twitter', patterns: ['twitter.com', 'x.com'] },
  { type: 'Pixiv', patterns: ['pixiv.net'] },
  { type: 'Nijie', patterns: ['nijie.info'] },
  { type: 'Fanbox', patterns: ['fanbox.cc'] },
  { type: 'Patreon', patterns: ['patreon.com'] },
  { type: 'Fantia', patterns: ['fantia.jp'] },
  { type: 'Hedao', patterns: ['hedaoapp.com'] },
]

const selectDisplayLinks = ({ links, designLink }: CreateLinksProps) => {
  const hasDesign = Boolean(designLink)
  const maxLinks = hasDesign ? 2 : 3

  const selected: Record<string, string> = {}
  for (const raw of links) {
    const url = sanitizeUrl(raw)
    for (const { type, patterns } of LINK_PRIORITY) {
      if (patterns.some(pattern => url.includes(pattern)) && !selected[type]) {
        selected[type] = url
        break
      }
    }
  }

  return {
    hasDesign,
    mainLinks: LINK_PRIORITY.filter(p => p.type in selected)
      .slice(0, maxLinks)
      .map(({ type }) => ({ type, url: selected[type] })),
    designLink: hasDesign ? sanitizeUrl(designLink!) : null,
  }
}

export const hasDisplayableLinks = (props: CreateLinksProps) => {
  const { mainLinks, designLink } = selectDisplayLinks(props)
  return mainLinks.length > 0 || Boolean(designLink)
}

/**
 * 根据提供的链接数组和可选 designLink 生成链接的 React 元素数组。
 *
 * 功能与规则：
 * 1. 优先从 links 中选取主要链接（Twitter、Pixiv、Patreon等），最多取3个。
 *    如果有 designLink，则主要链接的数量限制为2个（因为需要给 designLink 预留一个名额）。
 * 2. 渲染时，第一个链接不加左边距，后续链接通过添加 `ml-2 md:ml-3` 来分隔。
 * 3. 如果没有任何链接匹配（mainLinks为空且无designLink），则返回 'N/A'。
 * 4. 设计链接（Design）如果存在，始终在最后显示，并同样根据是否为第一个显示的链接决定是否添加间距。
 */
export const createLinks = ({ links, designLink }: CreateLinksProps) => {
  const { mainLinks, designLink: normalizedDesignLink } = selectDisplayLinks({ links, designLink })

  const mainLinkElements = mainLinks.map(({ type, url }, index) => (
    <span key={type} className={index > 0 ? 'ml-2 md:ml-3' : ''}>
      <AppLink href={url} className={COMMISSION_LINK_TEXT_CLASS} target="_blank">
        {type}
      </AppLink>
    </span>
  ))

  const designElement = normalizedDesignLink ? (
    <span key="Design" className={mainLinkElements.length > 0 ? 'ml-2 md:ml-3' : ''}>
      <AppLink href={normalizedDesignLink} className={COMMISSION_LINK_TEXT_CLASS} target="_blank">
        Design
      </AppLink>
    </span>
  ) : null

  const combined = designElement ? [...mainLinkElements, designElement] : mainLinkElements

  if (combined.length === 0) {
    return [<span key="error">N/A</span>]
  }

  return combined
}
