import { describe, expect, it } from 'vitest'
import type { AdminCommissionSearchRow } from '#lib/admin/db'
import {
  areNumberSetsEqual,
  buildCommissionToCharacterMap,
  collectMatchedCharacterIds,
} from './matchedCharacterIds'

const rows: AdminCommissionSearchRow[] = [
  {
    id: 1,
    characterId: 11,
    characterName: 'A',
    fileName: '20240101_a',
    design: null,
    description: null,
    keyword: null,
  },
  {
    id: 2,
    characterId: 22,
    characterName: 'B',
    fileName: '20240102_b',
    design: null,
    description: null,
    keyword: null,
  },
  {
    id: 3,
    characterId: 11,
    characterName: 'A',
    fileName: '20240103_a',
    design: null,
    description: null,
    keyword: null,
  },
]

describe('matchedCharacterIds helpers', () => {
  it('maps commission ids to character ids', () => {
    const map = buildCommissionToCharacterMap(rows)

    expect(map.get(1)).toBe(11)
    expect(map.get(2)).toBe(22)
    expect(map.get(3)).toBe(11)
  })

  it('collects matched character ids from matched commission ids', () => {
    const map = buildCommissionToCharacterMap(rows)
    const matchedCharacterIds = collectMatchedCharacterIds(new Set([1, 3, 999]), map)

    expect([...matchedCharacterIds].sort((left, right) => left - right)).toEqual([11])
  })

  it('compares number sets by contents', () => {
    expect(areNumberSetsEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(areNumberSetsEqual(new Set([1, 2]), new Set([1]))).toBe(false)
    expect(areNumberSetsEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
  })
})
