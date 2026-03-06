import { describe, expect, it } from 'vitest'
import { buildAdminCommissionSearchMetadata } from './commissionSearchMetadata'
import type { CommissionRow } from '#lib/admin/db'

const baseCommission = (overrides: Partial<CommissionRow> = {}): CommissionRow => ({
  id: 1,
  characterId: 1,
  characterName: 'L*cia',
  fileName: '20240819_Q (part 2)',
  links: [],
  design: null,
  description: 'Sample description',
  keyword: 'tag, Tag；別名',
  hidden: false,
  ...overrides,
})

describe('buildAdminCommissionSearchMetadata', () => {
  it('builds search text and deduplicated suggestions with creator aliases', () => {
    const result = buildAdminCommissionSearchMetadata(
      'L*cia',
      baseCommission(),
      new Map([['Q', ['Cue', 'cue']]]),
      new Map([['tag', ['タグ']]]),
    )

    expect(result.searchText).toContain('l*cia')
    expect(result.searchText).toContain('20240819')
    expect(result.searchText).toContain('date_y_2024')
    expect(result.searchText).toContain('date_ym_2024_08')
    expect(result.searchText).toContain('q (part 2)')
    expect(result.searchText).toContain('cue')
    expect(result.searchText).toContain('sample description')
    expect(result.searchText).toContain('tag tag 別名')
    expect(result.searchText).toContain('タグ')

    const lines = result.searchSuggestionText.split('\n')
    expect(lines).toContain('Character\tL*cia')
    expect(lines).toContain('Date\t2024/08')
    expect(lines).toContain('Creator\tQ (part 2)')
    expect(lines).toContain('Creator\tCue')
    expect(lines).toContain('Keyword\ttag')
    expect(lines).toContain('Keyword\tタグ')
    expect(lines).toContain('Keyword\t別名')
    expect(lines.filter(line => line === 'Creator\tCue')).toHaveLength(1)
    expect(lines.filter(line => line === 'Creator\tcue')).toHaveLength(0)
    expect(lines.filter(line => line === 'Keyword\tTag')).toHaveLength(0)
  })

  it('omits creator suggestion for anonymous file names', () => {
    const result = buildAdminCommissionSearchMetadata(
      'Studio K',
      baseCommission({
        fileName: '20251203',
        keyword: null,
        description: null,
      }),
      new Map(),
    )

    const lines = result.searchSuggestionText.split('\n')
    expect(lines).toContain('Character\tStudio K')
    expect(lines).toContain('Date\t2025/12')
    expect(lines.some(line => line.startsWith('Creator\t'))).toBe(false)
  })
})
