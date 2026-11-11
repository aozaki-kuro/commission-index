import { describe, expect, it } from 'vitest'
import {
  buildFileNameSegmentContext,
  classifyFileNameSegments,
  extractCommissionDetails,
  resolveCharacterToken,
} from './commissionFileDetails'

describe('extractCommissionDetails', () => {
  it('recognizes a strict part suffix and keeps its creator name clean', () => {
    expect(extractCommissionDetails('20250302_Artist Studio (part 2).jpg')).toEqual({
      commissionDate: '2025-03-02',
      creatorName: 'Artist Studio',
      partNumber: 2,
      characterToken: null,
      segments: [],
    })
  })

  it('leaves non-part names standalone and rejects invalid part numbers', () => {
    expect(extractCommissionDetails('20250302_Artist Studio.jpg')).toMatchObject({
      creatorName: 'Artist Studio',
      partNumber: null,
    })
    expect(extractCommissionDetails('20250302_Artist Studio (part 0).jpg')).toMatchObject({
      creatorName: 'Artist Studio (part 0)',
      partNumber: null,
    })
    expect(extractCommissionDetails('20250302_Artist Studio (part two).jpg')).toMatchObject({
      creatorName: 'Artist Studio (part two)',
      partNumber: null,
    })
  })

  it('splits a character-prefixed name into its date and unordered segments', () => {
    expect(extractCommissionDetails('K_isj_ICHIZEN-RYUU_20261108_01.png')).toEqual({
      commissionDate: '2026-11-08',
      creatorName: '',
      partNumber: null,
      characterToken: 'K',
      segments: ['isj', 'ICHIZEN-RYUU'],
    })
    expect(extractCommissionDetails('Lucia_Ryoku_20230617_01.jpg')).toMatchObject({
      characterToken: 'Lucia',
      segments: ['Ryoku'],
    })
  })

  it('ignores the per-day sequence and the ex variant marker', () => {
    for (const name of [
      'Lucia_Nanashi_SC02_20230706_03ex.jpg',
      'Lucia_Nanashi_SC02_20230706ex.jpg',
      'Lucia_Nanashi_SC02_20230706_01.jpg',
      'Lucia_Nanashi_SC02_20230706.jpg',
    ]) {
      expect(extractCommissionDetails(name)).toMatchObject({
        commissionDate: '2023-07-06',
        partNumber: null,
        segments: ['Nanashi', 'SC02'],
      })
    }
  })

  it('rejects prefixed names with an impossible date or missing segments', () => {
    expect(extractCommissionDetails('K_isj_ICHIZEN-RYUU_20261332_01.jpg')).toBeNull()
    expect(extractCommissionDetails('K_isj_ICHIZEN-RYUU_01.jpg')).toBeNull()
    expect(extractCommissionDetails('K_20261108_01.jpg')).toBeNull()
    expect(extractCommissionDetails('K__ICHIZEN-RYUU_20261108.jpg')).toBeNull()
  })
})

describe('classifyFileNameSegments', () => {
  const context = buildFileNameSegmentContext(
    [
      { creatorName: '七市', keyword: 'TKS' },
      { creatorName: '月', keyword: 'isj, Sekai' },
      { creatorName: 'EyeRune', keyword: 'tks' },
      { creatorName: null, keyword: null },
    ],
    [
      {
        creatorName: '七市',
        aliases: ['Nanashi'],
      },
      {
        creatorName: '温野りょく',
        aliases: ['UnoRyoku'],
      },
    ],
  )

  it('classifies segments by the data, whatever their order', () => {
    expect(classifyFileNameSegments(['isj', 'ICHIZEN-RYUU'], context))
      .toEqual({ creatorName: 'ICHIZEN-RYUU', keyword: 'isj' })
    expect(classifyFileNameSegments(['Nanashi', 'TKS'], context))
      .toEqual({ creatorName: '七市', keyword: 'TKS' })
    expect(classifyFileNameSegments(['tks', 'sekai', 'EyeRune'], context))
      .toEqual({ creatorName: 'EyeRune', keyword: 'TKS, Sekai' })
  })

  it('resolves a creator alias, or one word of it, to the stored creator name', () => {
    expect(classifyFileNameSegments(['Ryoku'], context).creatorName).toBe('温野りょく')
    expect(classifyFileNameSegments(['uno-ryoku'], context).creatorName).toBe('温野りょく')
  })

  it('never takes a sort code as the creator and drops unrecognised extras', () => {
    expect(classifyFileNameSegments(['Nanashi', 'SC02'], context))
      .toEqual({ creatorName: '七市', keyword: '' })
    expect(classifyFileNameSegments(['NewArtist', 'SC02', 'Mystery'], context))
      .toEqual({ creatorName: 'NewArtist', keyword: '' })
    expect(classifyFileNameSegments(['SC02'], context))
      .toEqual({ creatorName: '', keyword: '' })
  })
})

describe('resolveCharacterToken', () => {
  const characters = [
    { id: 2, name: 'Studio K' },
    { id: 3, name: 'Lucia' },
    { id: 4, name: 'Kanaut Nishe' },
    { id: 12, name: 'K*toha' },
    { id: 13, name: 'Ak*shi Myu' },
    { id: 7, name: 'Ninomae Ina\'nis' },
  ]

  it('matches a full name or a unique word, ignoring case, spacing and punctuation', () => {
    expect(resolveCharacterToken('K', characters)?.id).toBe(2)
    expect(resolveCharacterToken('k', characters)?.id).toBe(2)
    expect(resolveCharacterToken('lucia', characters)?.id).toBe(3)
    expect(resolveCharacterToken('Nishe', characters)?.id).toBe(4)
    expect(resolveCharacterToken('Kanaut-Nishe', characters)?.id).toBe(4)
    expect(resolveCharacterToken('Inanis', characters)?.id).toBe(7)
  })

  it('treats * in a masked name, or in the token, as one character', () => {
    expect(resolveCharacterToken('Kotoha', characters)?.id).toBe(12)
    expect(resolveCharacterToken('AkashiMyu', characters)?.id).toBe(13)
    expect(resolveCharacterToken('Akashi', characters)?.id).toBe(13)
    expect(resolveCharacterToken('L*cia', characters)?.id).toBe(3)
    expect(resolveCharacterToken('Kotohaa', characters)).toBeNull()
  })

  it('resolves nothing for unknown or ambiguous tokens', () => {
    expect(resolveCharacterToken('Unknown', characters)).toBeNull()
    expect(resolveCharacterToken('*', characters)).toBeNull()
    expect(resolveCharacterToken('K', [
      ...characters,
      { id: 9, name: 'Project K' },
    ])).toBeNull()
  })
})
