import type { RssItem } from './rssItem'
import { getCommissionData } from '@data/commissionData'
import {
  collectUniqueCommissions,
  flattenCommissions,
} from '@lib/commissions/index'
import { renderRssFeed } from './rssFeed'
import { buildRssItem } from './rssItem'

function buildRssItems(): RssItem[] {
  const flattened = flattenCommissions(getCommissionData())
  const sorted = collectUniqueCommissions(flattened)

  return sorted.map(buildRssItem)
}

export function generateRssFeed(): string {
  return renderRssFeed(buildRssItems())
}
