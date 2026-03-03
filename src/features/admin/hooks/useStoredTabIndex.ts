import { useCallback, useEffect, useState } from 'react'

const buildLocalEventName = (storageKey: string) => `localstorage:${storageKey}`

const readTabIndex = (storageKey: string, tabCount: number): number => {
  if (typeof window === 'undefined') return 0

  const raw = window.localStorage.getItem(storageKey)
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed < tabCount ? parsed : 0
}

const useStoredTabIndex = (storageKey: string, tabCount: number) => {
  const localEvent = buildLocalEventName(storageKey)
  const [selectedIndex, setSelectedIndexState] = useState<number | null>(null)

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
      window.localStorage.setItem(storageKey, String(nextIndex))
      setSelectedIndexState(nextIndex)
      window.dispatchEvent(new Event(localEvent))
    },
    [localEvent, storageKey],
  )

  return [selectedIndex, setSelectedIndex] as const
}

export default useStoredTabIndex
