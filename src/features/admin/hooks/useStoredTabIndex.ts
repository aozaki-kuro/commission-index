import { useCallback, useEffect, useState } from 'react'

const buildLocalEventName = (storageKey: string) => `localstorage:${storageKey}`

const sanitizeTabIndex = (value: number, tabCount: number, fallbackIndex = 0) => {
  const normalizedFallback =
    Number.isFinite(fallbackIndex) && fallbackIndex >= 0 && fallbackIndex < tabCount
      ? fallbackIndex
      : 0

  return Number.isFinite(value) && value >= 0 && value < tabCount ? value : normalizedFallback
}

const readStoredValue = (storageKey: string): string | null => {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

const readTabIndex = (storageKey: string, tabCount: number, fallbackIndex = 0): number => {
  if (typeof window === 'undefined') return 0

  const raw = readStoredValue(storageKey)
  const parsed = Number(raw)
  return sanitizeTabIndex(parsed, tabCount, fallbackIndex)
}

const writeTabIndexCookie = (storageKey: string, value: number) => {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(storageKey)}=${encodeURIComponent(String(value))}; Path=/; Max-Age=31536000; SameSite=Lax`
}

interface UseStoredTabIndexOptions {
  initialIndex?: number
}

const useStoredTabIndex = (
  storageKey: string,
  tabCount: number,
  options: UseStoredTabIndexOptions = {},
) => {
  const { initialIndex } = options
  const localEvent = buildLocalEventName(storageKey)
  const [selectedIndex, setSelectedIndexState] = useState<number>(() => {
    const fallback = sanitizeTabIndex(initialIndex ?? 0, tabCount)
    if (initialIndex !== undefined) {
      return fallback
    }

    return readTabIndex(storageKey, tabCount, fallback)
  })

  useEffect(() => {
    const syncFromStorage = () => {
      setSelectedIndexState(previous => readTabIndex(storageKey, tabCount, previous))
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        syncFromStorage()
      }
    }

    const onLocal = () => syncFromStorage()

    if (initialIndex === undefined) {
      syncFromStorage()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(localEvent, onLocal)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(localEvent, onLocal)
    }
  }, [initialIndex, localEvent, storageKey, tabCount])

  const setSelectedIndex = useCallback(
    (nextIndex: number) => {
      const normalized = sanitizeTabIndex(nextIndex, tabCount, selectedIndex)
      try {
        window.localStorage.setItem(storageKey, String(normalized))
      } catch {
        // 存储不可用时仍保持当前会话中的 UI 可用
      }
      writeTabIndexCookie(storageKey, normalized)
      setSelectedIndexState(normalized)
      window.dispatchEvent(new Event(localEvent))
    },
    [localEvent, selectedIndex, storageKey, tabCount],
  )

  return [selectedIndex, setSelectedIndex] as const
}

export default useStoredTabIndex
