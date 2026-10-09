import { describe, expect, it } from 'vitest'
import { getLatestCommissionDate, isFutureCommissionDate } from './commissionDate'

describe('commission date future rule (latest zone UTC+14)', () => {
  // 12:00Z on 2026-10-09 is already 2026-10-10 in UTC+14, so that is the latest "today".
  const now = new Date('2026-10-09T12:00:00Z')

  it('treats the UTC+14 calendar date as today and accepts it', () => {
    expect(getLatestCommissionDate(now)).toBe('2026-10-10')
    expect(isFutureCommissionDate('2026-10-09', now)).toBe(false)
    expect(isFutureCommissionDate('2026-10-10', now)).toBe(false)
  })

  it('rejects the day after the UTC+14 calendar date', () => {
    expect(isFutureCommissionDate('2026-10-11', now)).toBe(true)
  })

  it('rejects far-future dates', () => {
    expect(isFutureCommissionDate('2999-12-31', now)).toBe(true)
  })

  it('moves the boundary exactly at UTC+14 midnight, i.e. 10:00Z of the previous UTC day', () => {
    const justBefore = new Date('2026-10-09T09:59:59.999Z')
    const atBoundary = new Date('2026-10-09T10:00:00Z')

    expect(getLatestCommissionDate(justBefore)).toBe('2026-10-09')
    expect(isFutureCommissionDate('2026-10-10', justBefore)).toBe(true)

    expect(getLatestCommissionDate(atBoundary)).toBe('2026-10-10')
    expect(isFutureCommissionDate('2026-10-10', atBoundary)).toBe(false)
    expect(isFutureCommissionDate('2026-10-11', atBoundary)).toBe(true)
  })

  it('carries across month and year ends', () => {
    expect(getLatestCommissionDate(new Date('2026-12-31T11:00:00Z'))).toBe('2027-01-01')
  })
})
