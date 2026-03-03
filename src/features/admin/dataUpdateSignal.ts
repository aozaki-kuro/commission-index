const channelName = 'commission-updates'
const storageKey = 'commission-updated-at'

const sendStoragePing = () => {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, `${Date.now()}`)
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}

export const notifyDataUpdate = () => {
  // BroadcastChannel preferred; fall back to storage events
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(channelName)
      channel.postMessage({ type: 'updated', at: Date.now() })
      channel.close()
      return
    }
  } catch {
    // ignore and fall back
  }

  sendStoragePing()
}

export const subscribeToDataUpdates = (onUpdate: () => void) => {
  let channel: BroadcastChannel | null = null

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(channelName)
      channel.onmessage = () => onUpdate()
    }
  } catch {
    // ignore and keep storage fallback
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey) onUpdate()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    if (channel) channel.close()
    window.removeEventListener('storage', onStorage)
  }
}

export const updateChannel = { name: channelName, storageKey }
