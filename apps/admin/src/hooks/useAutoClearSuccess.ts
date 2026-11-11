import { useEffect, useRef } from 'react'

export interface StatusMessage {
  text: string
  type: 'success' | 'error'
}

// Success notices dismiss themselves; errors stay until dismissed or replaced. The timer restarts only when
// `status` changes, so callers may pass an inline `clear`.
export function useAutoClearSuccess(status: StatusMessage | null, clear: () => void, delayMs: number) {
  const clearRef = useRef(clear)
  useEffect(() => {
    clearRef.current = clear
  })

  useEffect(() => {
    if (!status || status.type === 'error') {
      return
    }

    const timer = window.setTimeout(() => {
      clearRef.current()
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [status, delayMs])
}
