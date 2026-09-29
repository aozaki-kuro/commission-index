import { describe, expect, it } from 'vitest'
import { buildWorkGroupOptions } from '../../lib/commissionWorkGroups'

describe('buildWorkGroupOptions', () => {
  it('summarizes explicit groups by character, date, creator, and part count', () => {
    expect(buildWorkGroupOptions([
      {
        characterName: 'Sakura',
        commissionDate: '2025-03-02',
        creatorName: 'Artist',
        workGroupId: 'group-a',
        partNumber: 2,
      },
      {
        characterName: 'Sakura',
        commissionDate: '2025-03-02',
        creatorName: 'Artist',
        workGroupId: 'group-a',
        partNumber: 1,
      },
      {
        characterName: 'Rin',
        commissionDate: null,
        creatorName: null,
        workGroupId: 'group-b',
        partNumber: 1,
      },
      {
        characterName: 'Maya',
        commissionDate: '2025-03-02',
        creatorName: 'Artist',
        workGroupId: null,
        partNumber: null,
      },
    ])).toEqual([
      {
        id: 'group-b',
        label: 'Rin · Undated · Anon · 1 part',
        highestPartNumber: 1,
      },
      {
        id: 'group-a',
        label: 'Sakura · 2025-03-02 · Artist · 2 parts',
        highestPartNumber: 2,
      },
    ])
  })
})
