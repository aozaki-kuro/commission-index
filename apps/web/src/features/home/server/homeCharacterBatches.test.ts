import type { CharacterCommissions } from '@data/types'
import { getCharacterSectionId, getCharacterTitleId } from '@lib/characters/nav'
import { describe, expect, it, vi } from 'vitest'
import { buildHomeCharacterBatchManifest } from './homeCharacterBatchArtifacts'
import { buildHomeCharacterBatchPlan } from './homeCharacterBatches'

vi.mock('./batchPayloadBuilder', () => ({
  COMMISSION_IMAGE_SIZES: '(max-width: 768px) 92vw, 640px',
  COMMISSION_LINK_TEXT_CLASS: 'link',
  buildImagePayload: async () => null,
  buildInterestPayload: () => null,
}))

function buildCharacterCommissions(character: string, date: string): CharacterCommissions {
  return {
    Character: character,
    Commissions: [
      {
        id: Number(date),
        publicId: `00000000-0000-4000-8000-${date.padStart(12, '0')}`,
        commissionDate: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
        creatorName: 'artist',
        fileName: `${date}-artist`,
        workGroupId: null,
        partNumber: null,
        Links: [],
      },
    ],
  }
}

describe('buildHomeCharacterBatchPlan', () => {
  it('keeps active deferred batches at single-character granularity', () => {
    const alpha = buildCharacterCommissions('Alpha', '20240101')
    const beta = buildCharacterCommissions('Beta', '20240102')
    const gamma = buildCharacterCommissions('Gamma', '20240103')

    const plan = buildHomeCharacterBatchPlan({
      activeChars: [{ DisplayName: 'Alpha' }, { DisplayName: 'Beta' }, { DisplayName: 'Gamma' }],
      archivedChars: [],
      commissionMap: new Map(
        [alpha, beta, gamma].map(
          entry => [entry.Character, entry] satisfies [string, CharacterCommissions],
        ),
      ),
    })

    expect(plan.active.initialCharacters).toEqual(['Alpha'])
    expect(plan.active.batches).toEqual([['Beta'], ['Gamma']])
    expect(plan.active.totalBatches).toBe(2)
    expect(plan.active.targetBatchById[getCharacterSectionId('Beta')]).toBe(0)
    expect(plan.active.targetBatchById[getCharacterTitleId('Beta')]).toBe(0)
    expect(plan.active.targetBatchById[`${getCharacterSectionId('Beta')}-20240102`]).toBe(0)
    expect(plan.active.targetBatchById[`${getCharacterSectionId('Beta')}-commission-00000000-0000-4000-8000-000020240102`]).toBe(0)
    expect(plan.active.targetBatchById[getCharacterSectionId('Gamma')]).toBe(1)
    expect(plan.active.targetBatchById[getCharacterTitleId('Gamma')]).toBe(1)
    expect(plan.active.targetBatchById[`${getCharacterSectionId('Gamma')}-20240103`]).toBe(1)
    expect(plan.active.targetBatchById[`${getCharacterSectionId('Gamma')}-commission-00000000-0000-4000-8000-000020240103`]).toBe(1)
  })

  it.each([
    {
      status: 'active' as const,
      chars: [
        { name: 'Alpha', date: '20240101' },
        { name: 'Empty Active', date: null },
        { name: 'Gamma', date: '20240103' },
      ],
      emptyName: 'Empty Active',
      realName: 'Gamma',
      expectedBatches: [['Empty Active'], ['Gamma']],
    },
    {
      status: 'archived' as const,
      chars: [
        { name: 'Archived Empty', date: null },
        { name: 'Archived Two', date: '20240202' },
      ],
      emptyName: 'Archived Empty',
      realName: 'Archived Two',
      expectedBatches: [['Archived Empty'], ['Archived Two']],
    },
  ] as const)('does not register empty $status characters as deferred navigation targets', ({
    status,
    chars,
    emptyName,
    realName,
    expectedBatches,
  }) => {
    const commissionMap = new Map(
      chars.map(({ name, date }) => [
        name,
        date === null
          ? { Character: name, Commissions: [] } satisfies CharacterCommissions
          : buildCharacterCommissions(name, date),
      ] satisfies [string, CharacterCommissions]),
    )

    const plan = buildHomeCharacterBatchPlan({
      activeChars: status === 'active' ? chars.map(({ name }) => ({ DisplayName: name })) : [],
      archivedChars: status === 'archived' ? chars.map(({ name }) => ({ DisplayName: name })) : [],
      commissionMap,
    })

    expect(plan[status].batches).toEqual(expectedBatches)
    expect(plan[status].targetBatchById[getCharacterSectionId(emptyName)]).toBeUndefined()
    expect(plan[status].targetBatchById[getCharacterTitleId(emptyName)]).toBeUndefined()
    expect(plan[status].targetBatchById[getCharacterSectionId(realName)]).toBe(1)
  })

  it('keeps archived batches at single-character granularity including the first batch', () => {
    const archivedOne = buildCharacterCommissions('Archived One', '20240201')
    const archivedTwo = buildCharacterCommissions('Archived Two', '20240202')
    const archivedThree = buildCharacterCommissions('Archived Three', '20240203')

    const plan = buildHomeCharacterBatchPlan({
      activeChars: [],
      archivedChars: [
        { DisplayName: 'Archived One' },
        { DisplayName: 'Archived Two' },
        { DisplayName: 'Archived Three' },
      ],
      commissionMap: new Map(
        [archivedOne, archivedTwo, archivedThree].map(
          entry => [entry.Character, entry] satisfies [string, CharacterCommissions],
        ),
      ),
    })

    expect(plan.archived.initialCharacters).toEqual([])
    expect(plan.archived.batches).toEqual([['Archived One'], ['Archived Two'], ['Archived Three']])
    expect(plan.archived.totalBatches).toBe(3)
    expect(plan.archived.targetBatchById[getCharacterSectionId('Archived One')]).toBe(0)
    expect(plan.archived.targetBatchById[getCharacterSectionId('Archived Two')]).toBe(1)
    expect(plan.archived.targetBatchById[getCharacterSectionId('Archived Three')]).toBe(2)
  })
})

describe('buildHomeCharacterBatchManifest', () => {
  const commissionMap = new Map(
    [
      buildCharacterCommissions('Alpha', '20240101'),
      buildCharacterCommissions('Beta', '20240102'),
      buildCharacterCommissions('Archived One', '20240201'),
    ].map(entry => [entry.Character, entry] satisfies [string, CharacterCommissions]),
  )

  it('preserves the first active section as the only eagerly rendered section', async () => {
    const plan = buildHomeCharacterBatchPlan({
      activeChars: [{ DisplayName: 'Alpha' }, { DisplayName: 'Beta' }],
      archivedChars: [{ DisplayName: 'Archived One' }],
      commissionMap,
    })

    const manifest = await buildHomeCharacterBatchManifest({
      characterAliasesMap: null,
      commissionMap,
      creatorAliasesMap: null,
      keywordAliasesMap: null,
      locale: 'en',
      plan,
      searchEntriesVersion: 'search-v',
    })

    expect(manifest.active.initialSectionIds).toEqual([getCharacterSectionId('Alpha')])
    expect(manifest.active.totalBatches).toBe(1)
    expect(manifest.archived.initialSectionIds).toEqual([])
    expect(manifest.archived.totalBatches).toBe(1)
  })
})
