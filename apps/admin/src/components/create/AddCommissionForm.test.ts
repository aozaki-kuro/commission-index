import { describe, expect, it } from 'vitest'
import { extractCommissionDetails, resolveCharacterToken } from '../../lib/commissionFileDetails'

describe('extractCommissionDetails', () => {
  it('recognizes a strict part suffix and keeps its creator name clean', () => {
    expect(extractCommissionDetails('20250302_Artist Studio (part 2).jpg')).toEqual({
      commissionDate: '2025-03-02',
      creatorName: 'Artist Studio',
      workGroupId: 'new',
      partNumber: 2,
      characterToken: null,
      keyword: null,
    })
  })

  it('leaves non-part names standalone and rejects invalid part numbers', () => {
    expect(extractCommissionDetails('20250302_Artist Studio.jpg')).toMatchObject({
      creatorName: 'Artist Studio',
      workGroupId: '',
      partNumber: null,
    })
    expect(extractCommissionDetails('20250302_Artist Studio (part 0).jpg')).toMatchObject({
      creatorName: 'Artist Studio (part 0)',
      workGroupId: '',
      partNumber: null,
    })
    expect(extractCommissionDetails('20250302_Artist Studio (part two).jpg')).toMatchObject({
      creatorName: 'Artist Studio (part two)',
      workGroupId: '',
      partNumber: null,
    })
  })

  it('reads character, keyword, creator and date from a prefixed name', () => {
    expect(extractCommissionDetails('K_isj_ICHIZEN-RYUU_20261108_01.png')).toEqual({
      commissionDate: '2026-11-08',
      creatorName: 'ICHIZEN-RYUU',
      workGroupId: '',
      partNumber: null,
      characterToken: 'K',
      keyword: 'isj',
    })
    expect(extractCommissionDetails('K_isj_Some_Artist_20261108.jpg')).toMatchObject({
      creatorName: 'Some_Artist',
      characterToken: 'K',
      keyword: 'isj',
    })
  })

  it('rejects prefixed names with an impossible date or missing segments', () => {
    expect(extractCommissionDetails('K_isj_ICHIZEN-RYUU_20261332_01.jpg')).toBeNull()
    expect(extractCommissionDetails('K_ICHIZEN-RYUU_20261108_01.jpg')).toBeNull()
    expect(extractCommissionDetails('K_isj_ICHIZEN-RYUU_01.jpg')).toBeNull()
  })
})

describe('resolveCharacterToken', () => {
  const characters = [
    { id: 2, name: 'Studio K' },
    { id: 3, name: 'Lucia' },
    { id: 4, name: 'Kanaut Nishe' },
    { id: 12, name: 'K*toha' },
  ]

  it('matches a full name or a unique last word, case-insensitively', () => {
    expect(resolveCharacterToken('K', characters)?.id).toBe(2)
    expect(resolveCharacterToken('k', characters)?.id).toBe(2)
    expect(resolveCharacterToken('lucia', characters)?.id).toBe(3)
    expect(resolveCharacterToken('Nishe', characters)?.id).toBe(4)
  })

  it('resolves nothing for unknown or ambiguous tokens', () => {
    expect(resolveCharacterToken('Studio', characters)).toBeNull()
    expect(resolveCharacterToken('K', [
      ...characters,
      { id: 9, name: 'Project K' },
    ])).toBeNull()
  })
})
