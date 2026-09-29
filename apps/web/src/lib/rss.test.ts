import { describe, expect, it } from 'vitest'
import { buildRssItem } from './rssItem'

describe('buildRssItem', () => {
  it('uses stable identity and explicit metadata instead of the image mapping key', () => {
    const item = buildRssItem({
      id: 42,
      commissionDate: '2024-02-03',
      creatorName: 'Artist Name',
      fileName: 'not-a-date-or-author',
      Links: [],
      character: 'Alpha',
    })

    expect(item.guid).toBe('commission-42')
    expect(item.author).toBe('Artist Name')
    expect(item.pubDate).toBe(new Date('2024-02-03T00:00:00Z').toUTCString())
    expect(item.link).toBe('https://crystallize.cc#alpha-commission-42')
    expect(item.description).toContain('2024/02/03')
  })

  it('omits RSS publication time when the commission date is unknown', () => {
    const item = buildRssItem({
      id: 43,
      commissionDate: null,
      creatorName: null,
      fileName: 'asset-key',
      Links: [],
      character: 'Alpha',
    })

    expect(item.author).toBe('Anonymous')
    expect(item.pubDate).toBeNull()
    expect(item.description).not.toContain('published on')
  })
})
