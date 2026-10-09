import type { CommissionSearchEntrySource } from './commissionSearchIndex'
// @vitest-environment jsdom
import { buildCommissionSearchMetadata } from '@commission-index/domain'
import { getMatchedEntryIds } from '@lib/search/index'
import { describe, expect, it } from 'vitest'
import { buildSearchIndex } from './commissionSearchIndex'

function buildEntry({
  id,
  domKey,
  searchSuggest,
}: {
  id: number
  domKey: string
  searchSuggest: string
}): CommissionSearchEntrySource {
  return {
    id,
    domKey,
    searchText: `entry-${id}`,
    searchSuggest,
  }
}

function buildMetadataEntry({
  id,
  domKey,
  characterName,
  creatorName,
}: {
  id: number
  domKey: string
  characterName: string
  creatorName: string
}): CommissionSearchEntrySource {
  const metadata = buildCommissionSearchMetadata({
    characterName,
    commissionDate: null,
    creatorName,
    creatorSearchTextMode: 'both',
    creatorSuggestionMode: 'raw',
  })
  return {
    id,
    domKey,
    searchText: metadata.searchText,
    searchSuggest: metadata.searchSuggestionText,
  }
}

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

  it('reuses cached external entries while refreshing dom visibility context', () => {
    const externalEntries = [
      buildEntry({ id: 1, domKey: 'first', searchSuggest: 'Keyword\tmaid' }),
      buildEntry({ id: 2, domKey: 'second', searchSuggest: 'Keyword\tbutler' }),
    ]

    document.body.innerHTML = `
      <section data-character-section="true" id="alpha">
        <article
          data-commission-entry="true"
          data-character-section-id="alpha"
          data-commission-search-key="first"
        ></article>
      </section>
    `

    const first = buildSearchIndex('character', externalEntries)
    const firstEntries = first.entries
    const firstElement = first.entries[0]?.element

    document.body.innerHTML = `
      <section data-character-section="true" id="beta">
        <article
          data-commission-entry="true"
          data-character-section-id="beta"
          data-commission-search-key="second"
        ></article>
      </section>
    `

    const second = buildSearchIndex('character', externalEntries)

    expect(second.entries).toBe(firstEntries)
    expect(second.entries[0]?.element).not.toBe(firstElement)
    expect(second.entries[0]?.element).toBeUndefined()
    expect(second.entries[0]?.sectionId).toBeUndefined()
    expect(second.entries[1]?.element).toBeInstanceOf(HTMLElement)
    expect(second.entries[1]?.sectionId).toBe('beta')
  })
})

describe('commissionSearchIndex strict term matching across scripts', () => {
  function buildIndex() {
    return buildSearchIndex(
      'character',
      [
        buildMetadataEntry({ id: 1, domKey: 'han', characterName: 'Kanaut Nishe', creatorName: '七市' }),
        buildMetadataEntry({ id: 2, domKey: 'latin', characterName: 'Kanaut Nishe', creatorName: 'Lucia' }),
        buildMetadataEntry({ id: 3, domKey: 'kana', characterName: 'Kanaut Nishe', creatorName: 'ナナシ' }),
      ],
      { skipDomContext: true },
    )
  }

  it('excludes a CJK creator term in strict negation', () => {
    const matched = getMatchedEntryIds('"Kanaut Nishe" !Lucia !七市', buildIndex())
    expect(matched).toEqual(new Set([3]))
  })

  it('excludes a katakana creator term in strict negation', () => {
    const matched = getMatchedEntryIds('"Kanaut Nishe" !ナナシ', buildIndex())
    expect(matched).toEqual(new Set([1, 2]))
  })
})
