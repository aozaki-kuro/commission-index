import { describe, expect, it } from 'vitest'
import { extractCommissionDetails } from '../../lib/commissionFileDetails'

describe('extractCommissionDetails', () => {
  it('recognizes a strict part suffix and keeps its creator name clean', () => {
    expect(extractCommissionDetails('20250302_Artist Studio (part 2).jpg')).toEqual({
      commissionDate: '2025-03-02',
      creatorName: 'Artist Studio',
      workGroupId: 'new',
      partNumber: 2,
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
})
