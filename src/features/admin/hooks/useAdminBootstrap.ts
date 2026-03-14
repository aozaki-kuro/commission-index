import { fetchAdminBootstrapWithRetry } from '#admin/bootstrapFetch'
import { subscribeToDataUpdates } from '#admin/dataUpdateSignal'
import { useCallback, useEffect, useState } from 'react'

interface UseAdminBootstrapOptions<TPayload> {
  initialPayload?: TPayload | null
  errorFallback: string
  subscribeUpdates?: boolean
  endpoint?: string
}

export function useAdminBootstrap<TPayload>({
  initialPayload = null,
  errorFallback,
  subscribeUpdates = false,
  endpoint,
}: UseAdminBootstrapOptions<TPayload>) {
  const [payload, setPayload] = useState<TPayload | null>(initialPayload)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback(() => {
    setErrorMessage(null)
    setReloadToken(token => token + 1)
  }, [])

  useEffect(() => {
    if (!import.meta.env?.DEV)
      return

    let active = true
    let controller: AbortController | null = null

    const loadData = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const data = await fetchAdminBootstrapWithRetry<TPayload>({
          signal: controller.signal,
          endpoint,
        })
        if (active) {
          setPayload(data)
          setErrorMessage(null)
        }
      }
      catch (error) {
        if (!active || controller.signal.aborted)
          return
        const message = error instanceof Error ? error.message : errorFallback
        setErrorMessage(message)
      }
    }

    void loadData()
    const unsubscribe = subscribeUpdates
      ? subscribeToDataUpdates(() => {
          void loadData()
        })
      : () => {}

    return () => {
      active = false
      controller?.abort()
      unsubscribe()
    }
  }, [endpoint, errorFallback, reloadToken, subscribeUpdates])

  return {
    payload,
    errorMessage,
    isLoading: !payload && !errorMessage,
    reload,
  }
}
