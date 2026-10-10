import { describe, expect, it } from 'vitest'
import { AGE_CONFIRM_DURATION, hasValidAgeConfirmation } from './ageGate'

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
