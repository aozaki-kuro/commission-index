import { describe, expect, it } from 'vitest'
import { buildCommissionSearchDomKey, buildCommissionSearchMetadata } from './commissionSearchMetadata'

describe('commissionSearchMetadata', () => {
  it('uses explicit date and creator fields for public search metadata', () => {
    const metadata = buildCommissionSearchMetadata({
      characterName: 'Alpha',
      commissionDate: '2024-02-03',
      creatorName: 'Artist Name',
      keyword: 'blue',
    })

    expect(metadata.searchText).toContain('20240203')
    expect(metadata.searchText).toContain('artist name')
    expect(metadata.searchSuggestionText).toContain('Date\t2024/02')
    expect(metadata.searchSuggestionText).toContain('Creator\tArtist Name')

    const publicId = '00000000-0000-4000-8000-000000000042'
    expect(buildCommissionSearchDomKey('section-alpha', publicId)).toBe(`section-alpha::${publicId}`)
  })

  it('does not invent date or creator terms when structured values are missing', () => {
    const metadata = buildCommissionSearchMetadata({
      characterName: 'Alpha',
      commissionDate: null,
      creatorName: null,
    })

    expect(metadata.searchText).not.toContain('date_')
    expect(metadata.searchSuggestionText).not.toContain('Date\t')
    expect(metadata.searchSuggestionText).not.toContain('Creator\t')
  })
})
