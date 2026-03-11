// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildSearchIndex, type CommissionSearchEntrySource } from './commissionSearchIndex'

const buildEntry = ({
  id,
  domKey,
  searchSuggest,
}: {
  id: number
  domKey: string
  searchSuggest: string
}): CommissionSearchEntrySource => ({
  id,
  domKey,
  searchText: `entry-${id}`,
  searchSuggest,
})

describe('commissionSearchIndex', () => {
  it('reuses parsed suggestion rows for repeated searchSuggest values', () => {
    const first = buildSearchIndex(
      'character',
      [buildEntry({ id: 1, domKey: 'first', searchSuggest: 'Keyword\tmaid' })],
      { skipDomContext: true },
    )
    const second = buildSearchIndex(
      'character',
      [buildEntry({ id: 1, domKey: 'first', searchSuggest: 'Keyword\tmaid' })],
      { skipDomContext: true },
    )

    expect(first.entries[0]?.suggestionRows).toBe(second.entries[0]?.suggestionRows)
  })

  it('evicts old parsed suggestion rows when cache grows beyond limit', () => {
    const firstSuggest = 'Keyword\toldest'
    const first = buildSearchIndex(
      'character',
      [buildEntry({ id: 1, domKey: 'first', searchSuggest: firstSuggest })],
      { skipDomContext: true },
    )
    const firstRows = first.entries[0]?.suggestionRows

    for (let i = 0; i < 520; i += 1) {
      buildSearchIndex(
        'character',
        [buildEntry({ id: i + 2, domKey: `entry-${i}`, searchSuggest: `Keyword\tterm-${i}` })],
        { skipDomContext: true },
      )
    }

    const afterOverflow = buildSearchIndex(
      'character',
      [buildEntry({ id: 1, domKey: 'first', searchSuggest: firstSuggest })],
      { skipDomContext: true },
    )

    expect(afterOverflow.entries[0]?.suggestionRows).not.toBe(firstRows)
  })
})
