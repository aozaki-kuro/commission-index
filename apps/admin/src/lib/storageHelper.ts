let hasShownQuotaNotice = false

/**
 * Safely write to localStorage or sessionStorage with quota error handling.
 *
 * @param storage - The Storage instance (localStorage or sessionStorage)
 * @param key - Storage key
 * @param value - String value to store
 * @param onQuotaExceeded - Optional callback fired once per session on first quota error
 * @returns true if write succeeded, false if quota exceeded or other error
 */
export function safeStorageSet(
  storage: Storage,
  key: string,
  value: string,
  onQuotaExceeded?: () => void,
): boolean {
  try {
    storage.setItem(key, value)
    return true
  }
  catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn(`Storage quota exceeded for key: ${key} (${value.length} chars)`)
      if (!hasShownQuotaNotice) {
        hasShownQuotaNotice = true
        onQuotaExceeded?.()
      }
    }
    else {
      console.error('Storage write failed:', error)
    }
    return false
  }
}

export function resetQuotaNoticeForTests() {
  hasShownQuotaNotice = false
}
