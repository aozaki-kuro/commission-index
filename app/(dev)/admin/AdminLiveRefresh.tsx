'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { updateChannel } from './dataUpdateSignal'

// Dev-only listener that refreshes the admin page when admin updates occur.
const AdminLiveRefresh = () => {
  const router = useRouter()
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (typeof window === 'undefined') return

    const refresh = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        router.refresh()
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
  }, [router])

  return null
}

export default AdminLiveRefresh
