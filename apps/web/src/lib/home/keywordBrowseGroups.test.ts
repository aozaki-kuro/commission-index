import type { CharacterCommissions, Commission } from '@commission-index/domain'
import { describe, expect, it } from 'vitest'
import { buildKeywordBrowseGroups } from './keywordBrowseGroups'

function character(name: string, keywords: Array<string | undefined>): CharacterCommissions {
  return {
    Character: name,
    Commissions: keywords.map((Keyword, index) => ({ id: index, Keyword }) as Commission),
  }
}

describe('buildKeywordBrowseGroups', () => {
  it('keeps character order and ranks each character\'s keywords by work count', () => {
    const groups = buildKeywordBrowseGroups([
      character('Studio K', [
        'isj, Sekai',
        'isj',
        'CIEL, ASU',
        'ASU',
      ]),
      character('Lucia', [undefined, 'TKS']),
    ], [])

    expect(groups).toEqual([
      {
        character: 'Studio K',
        keywords: ['ASU', 'isj', 'CIEL', 'Sekai'],
      },
      {
        character: 'Lucia',
        keywords: ['TKS'],
      },
    ])
  })

  it('collapses aliases to the base keyword and drops the character\'s own name', () => {
    const groups = buildKeywordBrowseGroups([
      character('Tokomachi', ['星街すいせい', 'Hoshimachi Suisei, 星街すいせい', 'tokomachi']),
    ], [
      {
        baseKeyword: 'Hoshimachi Suisei',
        aliases: ['星街すいせい'],
      },
    ])

    expect(groups).toEqual([
      {
        character: 'Tokomachi',
        keywords: ['Hoshimachi Suisei'],
      },
    ])
  })

  it('skips characters with no visible works and keeps ones without keywords', () => {
    const groups = buildKeywordBrowseGroups([
      character('Empty', []),
      character('MUS1CA', [undefined]),
    ], [])

    expect(groups).toEqual([
      { character: 'MUS1CA', keywords: [] },
    ])
  })
})
