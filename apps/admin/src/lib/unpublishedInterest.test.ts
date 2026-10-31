import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { describe, expect, it } from 'vitest'
import { rankUnpublishedInterest } from './unpublishedInterest'

function row(id: number, links: string, commissionDate = '2026-01-01'): AdminCommissionSearchRow {
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
    links,
    hidden: false,
  }
}

describe('rankUnpublishedInterest', () => {
  it('keeps voted works without source links, by votes then newest, capped', () => {
    const rows = [
      row(1, '[]', '2026-01-01'),
      row(2, '["https://example.com/2"]'),
      row(3, '', '2026-03-01'),
      row(4, '[]', '2026-02-01'),
      row(5, 'not json'),
      row(6, '[]'),
      row(7, '[""]'),
    ]
    const counts = {
      'public-1': 2,
      'public-2': 9,
      'public-3': 2,
      'public-4': 5,
      'public-5': 1,
      'public-7': 1,
      'public-deleted': 4,
    }

    expect(rankUnpublishedInterest(rows, counts).map(({ row, votes }) => [row.id, votes])).toEqual([
      [4, 5],
      [3, 2],
      [1, 2],
      [7, 1],
      [5, 1],
    ])
    expect(rankUnpublishedInterest(rows, counts, 2).map(({ row }) => row.id)).toEqual([4, 3])
  })
})
