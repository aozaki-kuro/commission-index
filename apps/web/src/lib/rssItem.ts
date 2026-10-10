import type { CommissionWithCharacter } from '@lib/commissions/index'
import { formatDate, parseDateString } from '@lib/date/format'
import { kebabCase } from '@lib/utils/strings'

const SITE_URL = 'https://crystallize.cc'

export interface RssItem {
  title: string
  link: string
  guid: string
  pubDate: string | null
  author: string
  description: string
}

export function buildRssItem(commission: CommissionWithCharacter): RssItem {
  const artistName = commission.creatorName?.trim() || 'Anon'
  const date = commission.commissionDate
  const dateObj = date ? parseDateString(date.replaceAll('-', '')) : null
  const pubDate = dateObj?.toUTCString() ?? null
  const formatted = dateObj ? formatDate(dateObj, 'yyyy/MM/dd') : null
  const link = `${SITE_URL}#${encodeURIComponent(kebabCase(commission.character))}-commission-${commission.publicId}`
  const dateText = formatted ? `, published on ${formatted}` : ''
  // Split any `]]>` so creator-supplied text cannot terminate the CDATA section early.
  const cdataSafe = `Illustrator: ${artistName}${dateText}`.replaceAll(']]>', ']]]]><![CDATA[>')
  const description = `<![CDATA[${cdataSafe}]]>`

  return {
    title: commission.character,
    link,
    guid: `commission-${commission.publicId}`,
    pubDate,
    author: artistName,
    description,
  }
}
