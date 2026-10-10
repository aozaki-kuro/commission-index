import type { RssItem } from './rssItem'

const SITE_TITLE = 'Crystallize\'s Commission Index'
const SITE_URL = 'https://crystallize.cc'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

export function renderRssFeed(rssItems: RssItem[]): string {
  const items = rssItems
    .map(
      item =>
        `\n    <item>\n      <title>${escapeXml(item.title)}</title>\n      <link>${escapeXml(item.link)}</link>\n      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>${item.pubDate ? `\n      <pubDate>${escapeXml(item.pubDate)}</pubDate>` : ''}\n      <author>${escapeXml(item.author)}</author>\n      <description>${item.description}</description>\n    </item>`,
    )
    .join('')

  // Newest item date instead of the wall clock keeps the feed byte-identical across rebuilds of the same data.
  const newest = rssItems
    .map(item => (item.pubDate ? Date.parse(item.pubDate) : Number.NaN))
    .filter(time => !Number.isNaN(time))
    .reduce<number | null>((max, time) => (max === null || time > max ? time : max), null)
  const lastBuildDate = newest === null
    ? ''
    : `\n    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>`

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${escapeXml(SITE_TITLE)}</title>\n    <link>${escapeXml(SITE_URL)}</link>\n    <atom:link href="${escapeXml(`${SITE_URL}/rss.xml`)}" rel="self" type="application/rss+xml" />\n    <description>Feed from Crystallize</description>\n    <language>en-US</language>\n    <webMaster>Crystallize</webMaster>\n    <ttl>60</ttl>${lastBuildDate}${items}\n  </channel>\n</rss>`
}
