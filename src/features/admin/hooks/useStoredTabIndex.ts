import { useCallback, useEffect, useState } from 'react'

const buildLocalEventName = (storageKey: string) => `localstorage:${storageKey}`

const readStoredValue = (storageKey: string): string | null => {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

const readTabIndex = (storageKey: string, tabCount: number): number => {
  if (typeof window === 'undefined') return 0

  const raw = readStoredValue(storageKey)
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed < tabCount ? parsed : 0
}

const useStoredTabIndex = (storageKey: string, tabCount: number) => {
  const localEvent = buildLocalEventName(storageKey)
  const [selectedIndex, setSelectedIndexState] = useState<number>(() =>
    readTabIndex(storageKey, tabCount),
  )

  useEffect(() => {
    const syncFromStorage = () => {
      setSelectedIndexState(readTabIndex(storageKey, tabCount))
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        syncFromStorage()
      }
    }

    const onLocal = () => syncFromStorage()

    syncFromStorage()
    window.addEventListener('storage', onStorage)
    window.addEventListener(localEvent, onLocal)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(localEvent, onLocal)
    }
  }, [localEvent, storageKey, tabCount])

  const setSelectedIndex = useCallback(
    (nextIndex: number) => {
      try {
        window.localStorage.setItem(storageKey, String(nextIndex))
      } catch {
        // 存储不可用时仍保持当前会话中的 UI 可用
      }
      setSelectedIndexState(nextIndex)
      window.dispatchEvent(new Event(localEvent))
    },
    [localEvent, storageKey],
  )

  return [selectedIndex, setSelectedIndex] as const
}

export default useStoredTabIndex
