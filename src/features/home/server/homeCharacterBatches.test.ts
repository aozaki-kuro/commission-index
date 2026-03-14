import { describe, expect, it } from 'vitest'
import type { CharacterCommissions } from '#data/types'
import { getCharacterSectionId, getCharacterTitleId } from '#lib/characters/nav'
import {
  buildHomeCharacterBatchManifest,
  buildHomeCharacterBatchPlan,
} from './homeCharacterBatches'

const buildCharacterCommissions = (character: string, date: string): CharacterCommissions => ({
  Character: character,
  Commissions: [
    {
      fileName: `${date}-artist`,
      Links: [],
    },
  ],
})

describe('buildHomeCharacterBatchPlan', () => {
  it('keeps active deferred batches at single-character granularity', () => {
    const alpha = buildCharacterCommissions('Alpha', '20240101')
    const beta = buildCharacterCommissions('Beta', '20240102')
    const gamma = buildCharacterCommissions('Gamma', '20240103')

    const plan = buildHomeCharacterBatchPlan({
      activeChars: [{ DisplayName: 'Alpha' }, { DisplayName: 'Beta' }, { DisplayName: 'Gamma' }],
      staleChars: [],
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
    expect(plan.active.targetBatchById[getCharacterSectionId('Gamma')]).toBe(1)
    expect(plan.active.targetBatchById[getCharacterTitleId('Gamma')]).toBe(1)
    expect(plan.active.targetBatchById[`${getCharacterSectionId('Gamma')}-20240103`]).toBe(1)
  })

  it('keeps stale batches at single-character granularity including the first batch', () => {
    const staleOne = buildCharacterCommissions('Stale One', '20240201')
    const staleTwo = buildCharacterCommissions('Stale Two', '20240202')
    const staleThree = buildCharacterCommissions('Stale Three', '20240203')

    const plan = buildHomeCharacterBatchPlan({
      activeChars: [],
      staleChars: [
        { DisplayName: 'Stale One' },
        { DisplayName: 'Stale Two' },
        { DisplayName: 'Stale Three' },
      ],
      commissionMap: new Map(
        [staleOne, staleTwo, staleThree].map(
          entry => [entry.Character, entry] satisfies [string, CharacterCommissions],
        ),
      ),
    })

    expect(plan.stale.initialCharacters).toEqual([])
    expect(plan.stale.batches).toEqual([['Stale One'], ['Stale Two'], ['Stale Three']])
    expect(plan.stale.totalBatches).toBe(3)
    expect(plan.stale.targetBatchById[getCharacterSectionId('Stale One')]).toBe(0)
    expect(plan.stale.targetBatchById[getCharacterSectionId('Stale Two')]).toBe(1)
    expect(plan.stale.targetBatchById[getCharacterSectionId('Stale Three')]).toBe(2)
  })
})

describe('buildHomeCharacterBatchManifest', () => {
  it('preserves the first active section as the only eagerly rendered section', () => {
    const plan = buildHomeCharacterBatchPlan({
      activeChars: [{ DisplayName: 'Alpha' }, { DisplayName: 'Beta' }],
      staleChars: [{ DisplayName: 'Stale One' }],
      commissionMap: new Map(
        [
          buildCharacterCommissions('Alpha', '20240101'),
          buildCharacterCommissions('Beta', '20240102'),
          buildCharacterCommissions('Stale One', '20240201'),
        ].map(entry => [entry.Character, entry] satisfies [string, CharacterCommissions]),
      ),
    })

    const manifest = buildHomeCharacterBatchManifest({
      locale: 'en',
      plan,
    })

    expect(manifest.active.initialSectionIds).toEqual([getCharacterSectionId('Alpha')])
    expect(manifest.active.totalBatches).toBe(1)
    expect(manifest.stale.initialSectionIds).toEqual([])
    expect(manifest.stale.totalBatches).toBe(1)
  })
})
