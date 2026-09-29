import type { AdminCommissionSearchRow } from '@commission-index/domain'
import { describe, expect, it } from 'vitest'
import { findDuplicateCommissionHints } from './duplicateCommissionHints'

function buildCommissionRow(
  overrides: Partial<AdminCommissionSearchRow> & Pick<AdminCommissionSearchRow, 'id' | 'fileName'>,
): AdminCommissionSearchRow {
  return {
    characterId: 1,
    characterName: 'Sakura',
    commissionDate: '2025-03-02',
    creatorName: 'Artist',
    links: '',
    description: null,
    design: null,
    keyword: null,
    hidden: false,
    ...overrides,
  }
}

describe('findDuplicateCommissionHints', () => {
  const commissions: AdminCommissionSearchRow[] = [
    buildCommissionRow({ id: 1, fileName: 'asset-a', keyword: 'dress, smile' }),
    buildCommissionRow({ id: 2, fileName: 'asset-b', creatorName: 'Other Artist', keyword: 'dress' }),
    buildCommissionRow({ id: 3, fileName: 'asset-c', creatorName: 'Artist (part 2)', keyword: 'dress, smile' }),
    buildCommissionRow({
      id: 4,
      characterId: 2,
      characterName: 'Rin',
      fileName: 'asset-d',
      keyword: 'dress, smile',
    }),
  ]

  it('does not warn when date or creator is missing', () => {
    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionDate: null,
      creatorName: 'Artist',
      commissions,
    })).toEqual([])

    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: '',
      commissions,
    })).toEqual([])
  })

  it('does not treat same-day entries by another creator as duplicates', () => {
    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'New Artist',
      commissions,
      keyword: 'dress',
    })).toEqual([])
  })

  it('warns without blocking when character, date, and creator match', () => {
    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: ' Artist ',
      commissions,
      keyword: 'dress, smile',
    })).toMatchObject([
      {
        commissionId: 1,
        reasons: ['Same character', 'Same date 2025-03-02', 'Same creator', 'Shared keyword: dress, smile'],
      },
    ])
  })

  it('keeps explicit part suffixes distinct for same-day multi-part work', () => {
    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'Artist',
      commissions,
    })).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ commissionId: 3 }),
    ]))
  })

  it('does not equate two unknown creators', () => {
    const entries = [
      buildCommissionRow({ id: 8, fileName: 'asset-x', creatorName: null }),
      buildCommissionRow({ id: 9, fileName: 'asset-y', creatorName: null }),
    ]

    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionDate: '2025-03-02',
      creatorName: '',
      commissions: entries,
    })).toEqual([])
  })

  it('excludes the current commission while editing', () => {
    expect(findDuplicateCommissionHints({
      characterId: 1,
      commissionId: 1,
      commissionDate: '2025-03-02',
      creatorName: 'Artist',
      commissions,
    })).toEqual([])
  })
})
