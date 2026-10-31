import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { describe, expect, it } from 'vitest'
import { normalizeLinkUrl, rankPopularCommissions } from './popularCommissions'

function row(id: number, links: string[] | string, commissionDate = '2026-01-01'): AdminCommissionSearchRow {
  return {
    id,
    publicId: `public-${id}`,
    characterId: 1,
    characterName: 'Aster',
    commissionDate,
    creatorName: null,
    workGroupId: null,
    partNumber: null,
    fileName: `asset-${id}`,
    links: typeof links === 'string'
      ? links
      : JSON.stringify(links),
    hidden: false,
  }
}

describe('normalizeLinkUrl', () => {
  it('matches across scheme, www, case, twitter/x and trailing slash but keeps the query', () => {
    expect(normalizeLinkUrl('http://www.Twitter.com/Artist/status/1/')).toBe(normalizeLinkUrl('https://x.com/artist/status/1'))
    expect(normalizeLinkUrl('https://www.pixiv.net/artworks/9#top')).toBe('pixiv.net/artworks/9')
    expect(normalizeLinkUrl('https://www.hedaoapp.com/goods?pid=1')).not.toBe(normalizeLinkUrl('https://www.hedaoapp.com/goods?pid=2'))
  })
})

describe('rankPopularCommissions', () => {
  it('sums a work\'s links, credits shared links to each work, ranks clicks then votes then newest', () => {
    const rows = [
      row(1, ['https://twitter.com/a/status/1', 'https://www.hedaoapp.com/goods?pid=1'], '2026-01-01'),
      row(2, ['https://www.pixiv.net/artworks/2'], '2026-02-01'),
      row(3, ['https://www.pixiv.net/artworks/2'], '2026-03-01'),
      row(4, '[]', '2026-04-01'),
      row(5, ['https://example.com/never-clicked']),
      row(6, 'not json'),
    ]
    const clicks = [
      { url: 'https://x.com/a/status/1', count: 5 },
      { url: 'https://hedaoapp.com/goods?pid=1', count: 4 },
      { url: 'https://www.pixiv.net/artworks/2/', count: 6 },
      { url: 'https://odaibako.net/u/someone', count: 99 },
    ]
    const votes = { 'public-4': 3, 'public-2': 1, 'public-deleted': 8 }

    expect(rankPopularCommissions(rows, clicks, votes).map(({ row: { id }, clicks, votes }) => [id, clicks, votes])).toEqual([
      [1, 9, 0],
      [2, 6, 1],
      [3, 6, 0],
      [4, 0, 3],
    ])
    expect(rankPopularCommissions(rows, clicks, votes, 2)).toHaveLength(2)
  })
})
