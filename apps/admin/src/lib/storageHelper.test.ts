// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetQuotaNoticeForTests, safeStorageSet } from './storageHelper'

// 所有写入抛 QuotaExceededError 的 Storage 桩，供配额相关用例复用
function quotaFailingStorage(): Storage {
  return {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn(),
    key: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn(() => {
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }),
  }
}

describe('safeStorageSet', () => {
  beforeEach(() => {
    resetQuotaNoticeForTests()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true and stores value on successful write', () => {
    const storage = window.localStorage
    const result = safeStorageSet(storage, 'test-key', 'test-value')

    expect(result).toBe(true)
    expect(storage.getItem('test-key')).toBe('test-value')
  })

  it('returns false and logs warning on QuotaExceededError', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockStorage = quotaFailingStorage()

    const result = safeStorageSet(mockStorage, 'quota-key', 'x'.repeat(10000))

    expect(result).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Storage quota exceeded'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('quota-key'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('10000 chars'))
  })

  it('fires quota callback once per session on first QuotaExceededError', () => {
    const callback = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockStorage = quotaFailingStorage()

    safeStorageSet(mockStorage, 'key1', 'value1', callback)
    expect(callback).toHaveBeenCalledTimes(1)

    safeStorageSet(mockStorage, 'key2', 'value2', callback)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not fire callback when onQuotaExceeded is not provided', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockStorage = quotaFailingStorage()

    expect(() => safeStorageSet(mockStorage, 'key', 'value')).not.toThrow()
  })

  it('logs generic error on non-quota storage failure', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockStorage: Storage = {
      length: 0,
      clear: vi.fn(),
      getItem: vi.fn(),
      key: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('Generic storage error')
      }),
    }

    const result = safeStorageSet(mockStorage, 'key', 'value')

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Storage write failed:', expect.any(Error))
  })
})
