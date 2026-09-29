import type { AdminCommissionSearchRow, CreatorAliasRow } from '@commission-index/domain'
import { describe, expect, it } from 'vitest'
import { buildAdminCommissionSearchEntries } from './adminCommissionSearch'

const commission: AdminCommissionSearchRow = {
  id: 4,
  characterId: 2,
  characterName: 'Sakura',
  fileName: 'opaque-object-key',
  commissionDate: '2025-03-02',
  creatorName: 'Artist Name',
  links: '',
  design: 'Summer dress',
  description: 'Beach scene',
  keyword: 'blue sky',
  hidden: false,
}

const aliases: CreatorAliasRow[] = [
  { creatorName: 'artist name', aliases: ['A. Name'], commissionCount: 1 },
]

describe('buildAdminCommissionSearchEntries', () => {
  it('indexes explicit date, creator, and creator aliases instead of the storage filename', () => {
    const [entry] = buildAdminCommissionSearchEntries([commission], aliases)

    expect(entry?.searchText).toContain('2025-03-02')
    expect(entry?.searchText).toContain('20250302')
    expect(entry?.searchText).toContain('date_y_2025')
    expect(entry?.searchText).toContain('date_ym_2025_03')
    expect(entry?.searchText).toContain('artist name')
    expect(entry?.searchText).toContain('a. name')
    expect(entry?.searchText).not.toContain('opaque-object-key')
  })

  it('keeps undated or unknown-creator commissions searchable by other fields', () => {
    const [entry] = buildAdminCommissionSearchEntries([{
      ...commission,
      commissionDate: null,
      creatorName: null,
      fileName: 'private-storage-key',
    }], [])

    expect(entry?.searchText).toContain('sakura')
    expect(entry?.searchText).toContain('beach scene')
    expect(entry?.searchText).not.toContain('private-storage-key')
  })
})
