// @vitest-environment jsdom
import {
  AGE_CONFIRM_DURATION,
  CONFIRMED_AGE_KEY,
  hasValidAgeConfirmation,
} from '#components/home/warning/Warning'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalUserAgent = navigator.userAgent

const setUserAgent = (userAgent: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  })
}

describe('hasValidAgeConfirmation', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    setUserAgent(originalUserAgent)
  })

  afterEach(() => {
    vi.useRealTimers()
    setUserAgent(originalUserAgent)
  })

  it('returns false when there is no saved age confirmation', () => {
    expect(hasValidAgeConfirmation()).toBe(false)
  })

  it('returns true when saved age confirmation is still valid', () => {
    localStorage.setItem(CONFIRMED_AGE_KEY, String(Date.now() - AGE_CONFIRM_DURATION + 1000))
    expect(hasValidAgeConfirmation()).toBe(true)
  })

  it('returns true for Lighthouse user agents without storage confirmation', () => {
    setUserAgent('Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36 Chrome-Lighthouse')
    expect(hasValidAgeConfirmation()).toBe(true)
  })
})
