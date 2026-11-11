import { describe, expect, it } from 'vitest'
import { normalizeCreatorName } from './creatorAliases'

describe('normalizeCreatorName', () => {
  it('strips a trailing (part N) suffix with or without a leading space', () => {
    expect(normalizeCreatorName('Q (part 2)')).toBe('Q')
    expect(normalizeCreatorName('Q(part 2)')).toBe('Q')
    expect(normalizeCreatorName('Q (Part12)')).toBe('Q')
    expect(normalizeCreatorName('Q (party)')).toBe('Q (party)')
    expect(normalizeCreatorName('Q (preview)')).toBe('Q (preview)')
  })
})
