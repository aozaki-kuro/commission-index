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

// Both fields end up in href. The worker validates links on write, but design is free text and rows written
// before that validation are never re-checked, so anything that is not an absolute http(s) URL is not a link.
function isWebUrl(value: string) {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol)
}

export function selectDisplayLinks({
  links,
  designLink: rawDesignLink,
}: DisplayLinksInput): DisplayLinksSelection {
  const designLink = rawDesignLink && isWebUrl(rawDesignLink)
    ? rawDesignLink
    : null
  const hasDesign = designLink !== null
  const maxLinks = hasDesign ? 2 : 3

  const buckets: Record<string, string[]> = {}
  for (const url of links.filter(isWebUrl)) {
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
    designLink,
  }
}

export function hasDisplayableLinks(props: DisplayLinksInput) {
  const { mainLinks, designLink } = selectDisplayLinks(props)
  return mainLinks.length > 0 || Boolean(designLink)
}
