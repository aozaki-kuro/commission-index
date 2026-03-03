import { useEffect, useRef } from 'react'

import { updateChannel } from '#admin/dataUpdateSignal'

// Dev-only listener that refreshes the page when admin updates occur.
const DevLiveRefresh = () => {
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    // Only attach in development
    if (!import.meta.env?.DEV) return
    if (typeof window === 'undefined') return

    const refresh = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        window.location.reload()
        debounceRef.current = null
      }, 120)
    }

    let channel: BroadcastChannel | null = null
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(updateChannel.name)
        channel.onmessage = refresh
      }
    } catch {
      // ignore
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === updateChannel.storageKey) refresh()
    }
    window.addEventListener('storage', onStorage)

    return () => {
      if (channel) channel.close()
      window.removeEventListener('storage', onStorage)
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  return null
}

export default DevLiveRefresh
