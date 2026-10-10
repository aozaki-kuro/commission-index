// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderRssFeed } from './rss'
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

describe('renderRssFeed', () => {
  const base = {
    workGroupId: null,
    partNumber: null,
    Links: [],
  }

  it('escapes text and yields well-formed XML with atom link and lastBuildDate', () => {
    const items = [
      buildRssItem({ ...base, id: 1, publicId: 'a', commissionDate: '2024-02-03', creatorName: 'A & <B> ]]> "C"', fileName: 'x', character: 'Tom & <Jerry>' }),
      buildRssItem({ ...base, id: 2, publicId: 'b', commissionDate: '2025-01-05', creatorName: 'Plain', fileName: 'y', character: 'Beta' }),
    ]
    const xml = renderRssFeed(items)
    const doc = new DOMParser().parseFromString(xml, 'application/xml')

    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelector('item > title')?.textContent).toBe('Tom & <Jerry>')
    expect(doc.querySelector('item > author')?.textContent).toBe('A & <B> ]]> "C"')
    expect(doc.querySelector('item > description')?.textContent).toContain('A & <B> ]]> "C"')
    const atom = doc.getElementsByTagName('atom:link')[0]
    expect(atom?.getAttribute('href')).toBe('https://crystallize.cc/rss.xml')
    expect(atom?.getAttribute('rel')).toBe('self')
    expect(doc.querySelector('channel > lastBuildDate')?.textContent).toBe(items[1].pubDate)
  })

  it('omits lastBuildDate when no item has a date', () => {
    const xml = renderRssFeed([
      buildRssItem({ ...base, id: 3, publicId: 'c', commissionDate: null, creatorName: null, fileName: 'z', character: 'Gamma' }),
    ])
    expect(xml).not.toContain('lastBuildDate')
  })
})
