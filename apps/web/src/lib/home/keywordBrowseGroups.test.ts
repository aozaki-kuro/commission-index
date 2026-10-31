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
        coCharacters: [],
        keywords: ['ASU', 'isj', 'CIEL', 'Sekai'],
      },
      {
        character: 'Lucia',
        coCharacters: [],
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
        coCharacters: [],
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
      { character: 'MUS1CA', coCharacters: [], keywords: [] },
    ])
  })

  it('moves another listed character\'s name or alias out of keywords into co-characters', () => {
    const groups = buildKeywordBrowseGroups([
      character('Lucia', ['TKS, Kanaut Nishe', 'kanaut nishe', 'K*naut, TKS, L*cia']),
      character('Kanaut Nishe', ['Lucia']),
    ], [], [
      {
        characterName: 'Kanaut Nishe',
        aliases: ['K*naut'],
      },
      {
        characterName: 'Lucia',
        aliases: ['L*cia'],
      },
    ])

    expect(groups).toEqual([
      {
        character: 'Lucia',
        coCharacters: ['Kanaut Nishe'],
        keywords: ['TKS'],
      },
      {
        character: 'Kanaut Nishe',
        coCharacters: ['Lucia'],
        keywords: [],
      },
    ])
  })
})
