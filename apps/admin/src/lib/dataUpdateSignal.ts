const channelName = 'commission-updates'
const storageKey = 'commission-updated-at'
// Unique per-tab ID so each tab can ignore its own broadcasts.
const tabSessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2)

function sendStoragePing() {
  try {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(storageKey, `${Date.now()}`)
  }
  catch {
    // ignore storage errors
  }
}

/**
 * Subscribers refetch only these characters. Omit the scope whenever the caller cannot name every affected
 * character: absent means "everything may have changed", which is also all the storage-ping fallback can say.
 */
export interface DataUpdateScope { characterIds: number[] }

function readScope(data: unknown): DataUpdateScope | undefined {
  const ids = (data as { characterIds?: unknown } | null)?.characterIds
  // A malformed scope must widen to a full refresh, never narrow to nothing.
  return Array.isArray(ids) && ids.length > 0 && ids.every(id => Number.isInteger(id) && id > 0)
    ? { characterIds: ids as number[] }
    : undefined
}

export function notifyDataUpdate(scope?: DataUpdateScope) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(channelName)
      channel.postMessage({
        at: Date.now(),
        ...(scope && { characterIds: [...new Set(scope.characterIds)] }),
        sessionId: tabSessionId,
        type: 'updated',
      })
      channel.close()
      return
    }
  }
  catch {
    // ignore and fall back to storage ping
  }

  sendStoragePing()
}

export function subscribeToDataUpdates(onUpdate: (scope?: DataUpdateScope) => void) {
  let channel: BroadcastChannel | null = null

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(channelName)
      channel.onmessage = (event) => {
        // Ignore our own broadcasts — local state is updated in-place instead.
        if (event.data?.sessionId !== tabSessionId) {
          onUpdate(readScope(event.data))
        }
      }
    }
  }
  catch {
    // ignore and keep storage fallback
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      onUpdate()
    }
  }

  window.addEventListener('storage', onStorage)

  return () => {
    if (channel) {
      channel.close()
    }

    window.removeEventListener('storage', onStorage)
  }
}
