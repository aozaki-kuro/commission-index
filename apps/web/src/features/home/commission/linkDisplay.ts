export interface DisplayLinksInput {
  links: string[]
  designLink?: string | null
}

export interface DisplayLink {
  type: string
  url: string
}

export interface DisplayLinksSelection {
  hasDesign: boolean
  mainLinks: DisplayLink[]
  designLink: string | null
}

export const COMMISSION_LINK_TEXT_CLASS = 'select-none underline underline-offset-2'

const LINK_PRIORITY: Array<{ type: string, patterns: string[] }> = [
  {
    type: 'Twitter',
    patterns: ['twitter.com', 'x.com'],
  },
  {
    type: 'Pixiv',
    patterns: ['pixiv.net'],
  },
  {
    type: 'Nijie',
    patterns: ['nijie.info'],
  },
  {
    type: 'Fanbox',
    patterns: ['fanbox.cc'],
  },
  {
    type: 'Patreon',
    patterns: ['patreon.com'],
  },
  {
    type: 'Fantia',
    patterns: ['fantia.jp'],
  },
  {
    type: 'Hedao',
    patterns: ['hedaoapp.com'],
  },
]

export function selectDisplayLinks({
  links,
  designLink,
}: DisplayLinksInput): DisplayLinksSelection {
  const hasDesign = Boolean(designLink)
  const maxLinks = hasDesign ? 2 : 3

  const buckets: Record<string, string[]> = {}
  for (const url of links) {
    for (const { type, patterns } of LINK_PRIORITY) {
      if (patterns.some(pattern => url.includes(pattern))) {
        if (!buckets[type])
          buckets[type] = []
        buckets[type].push(url)
        break
      }
    }
  }

  const flat: DisplayLink[] = []
  for (const { type } of LINK_PRIORITY) {
    const urls = buckets[type]
    if (!urls)
      continue
    if (urls.length === 1) {
      flat.push({ type, url: urls[0] })
    }
    else {
      urls.forEach((url, i) => {
        flat.push({ type: `${type} ${i + 1}`, url })
      })
    }
  }

  return {
    hasDesign,
    mainLinks: flat.slice(0, maxLinks),
    designLink: hasDesign ? designLink! : null,
  }
}

export function hasDisplayableLinks(props: DisplayLinksInput) {
  const { mainLinks, designLink } = selectDisplayLinks(props)
  return mainLinks.length > 0 || Boolean(designLink)
}
