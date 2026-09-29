import { describe, expect, it } from 'vitest'
import { buildRssItem } from './rssItem'

describe('buildRssItem', () => {
  it('uses stable identity and explicit metadata instead of the image mapping key', () => {
    const item = buildRssItem({
      id: 42,
      publicId: '00000000-0000-4000-8000-000000000042',
      commissionDate: '2024-02-03',
      creatorName: 'Artist Name',
      fileName: 'not-a-date-or-author',
      workGroupId: null,
      partNumber: null,
      Links: [],
      character: 'Alpha',
    })

    expect(item.guid).toBe('commission-00000000-0000-4000-8000-000000000042')
    expect(item.author).toBe('Artist Name')
    expect(item.pubDate).toBe(new Date('2024-02-03T00:00:00Z').toUTCString())
    expect(item.link).toBe('https://crystallize.cc#alpha-commission-00000000-0000-4000-8000-000000000042')
    expect(item.description).toContain('2024/02/03')
  })

  it('omits RSS publication time when the commission date is unknown', () => {
    const item = buildRssItem({
      id: 43,
      publicId: '00000000-0000-4000-8000-000000000043',
      commissionDate: null,
      creatorName: null,
      fileName: 'asset-key',
      workGroupId: null,
      partNumber: null,
      Links: [],
      character: 'Alpha',
    })

    expect(item.author).toBe('Anon')
    expect(item.pubDate).toBeNull()
    expect(item.description).not.toContain('published on')
  })
})
