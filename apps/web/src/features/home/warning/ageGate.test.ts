import { describe, expect, it } from 'vitest'
import { AGE_CONFIRM_DURATION, CONFIRMED_AGE_KEY, hasValidAgeConfirmation, readStoredAgeConfirmation, writeStoredAgeConfirmation } from './ageGate'

const now = 1_800_000_000_000
const browser = 'Mozilla/5.0 (Macintosh) Safari/605.1.15'

describe('hasValidAgeConfirmation', () => {
  it('accepts a fresh confirmation and rejects missing, malformed or expired ones', () => {
    const check = (storedValue: string | null) => hasValidAgeConfirmation({ userAgent: browser, storedValue, now })

    expect(check(String(now - 1000))).toBe(true)
    expect(check(String(now - AGE_CONFIRM_DURATION + 1))).toBe(true)
    expect(check(String(now - AGE_CONFIRM_DURATION))).toBe(false)
    expect(check(null)).toBe(false)
    expect(check('')).toBe(false)
    expect(check('not-a-number')).toBe(false)
  })

  it('treats Lighthouse user agents as confirmed regardless of storage', () => {
    expect(hasValidAgeConfirmation({ userAgent: 'Mozilla/5.0 Chrome-Lighthouse', storedValue: null, now })).toBe(true)
  })
})

describe('stored age confirmation helpers', () => {
  const blocked = (): Storage => {
    throw new DOMException('x', 'SecurityError')
  }
  const memoryStorage = (initial: Record<string, string> = {}): Storage => {
    const map = new Map(Object.entries(initial))
    return {
      getItem: key => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
    } as Storage
  }

  it('distinguishes unreadable storage (undefined) from empty storage (null)', () => {
    expect(readStoredAgeConfirmation(blocked)).toBeUndefined()
    expect(readStoredAgeConfirmation(() => ({ getItem: blocked }) as unknown as Storage)).toBeUndefined()
    expect(readStoredAgeConfirmation(() => memoryStorage())).toBeNull()
    expect(readStoredAgeConfirmation(() => memoryStorage({ [CONFIRMED_AGE_KEY]: '123' }))).toBe('123')
  })

  it('swallows write errors and writes when storage works', () => {
    expect(() => writeStoredAgeConfirmation(blocked, '1')).not.toThrow()
    const storage = memoryStorage()
    writeStoredAgeConfirmation(() => storage, '42')
    expect(storage.getItem(CONFIRMED_AGE_KEY)).toBe('42')
  })
})
