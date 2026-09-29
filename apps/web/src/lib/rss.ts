import type { RssItem } from './rssItem'
import { getCommissionData } from '@data/commissionData'
import {
  collectUniqueCommissions,
  flattenCommissions,
} from '@lib/commissions/index'
import { buildRssItem } from './rssItem'

const SITE_TITLE = 'Crystallize\'s Commission Index'
const SITE_URL = 'https://crystallize.cc'

function buildRssItems(): RssItem[] {
  const flattened = flattenCommissions(getCommissionData())
  const sorted = collectUniqueCommissions(flattened)

  return sorted.map(buildRssItem)
}

export function generateRssFeed(): string {
  const items = buildRssItems()
    .map(
      item =>
        `\n    <item>\n      <title>${item.title}</title>\n      <link>${item.link}</link>\n      <guid isPermaLink="false">${item.guid}</guid>${item.pubDate ? `\n      <pubDate>${item.pubDate}</pubDate>` : ''}\n      <author>${item.author}</author>\n      <description>${item.description}</description>\n    </item>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${SITE_TITLE}</title>\n    <link>${SITE_URL}</link>\n    <description>Feed from Crystallize</description>\n    <language>en-US</language>\n    <webMaster>Crystallize</webMaster>\n    <ttl>60</ttl>${items}\n  </channel>\n</rss>`
}
