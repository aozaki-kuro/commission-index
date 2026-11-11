import { useCallback, useEffect, useReducer, useState } from 'react'
import { fetchAdminJsonWithRetry, readCachedAdminJson } from '../lib/adminApi'

export interface AdminResourceState<T> {
  errorMessage: string | null
  isLoading: boolean
  payload: T | null
}

type AdminResourceAction<T>
  = { type: 'loading' }
    | { payload: T, type: 'loaded' }
    | { message: string, type: 'failed' }

function adminResourceReducer<T>(state: AdminResourceState<T>, action: AdminResourceAction<T>): AdminResourceState<T> {
  switch (action.type) {
    case 'loading':
      return {
        ...state,
        errorMessage: null,
        isLoading: true,
      }
    case 'loaded':
      return {
        errorMessage: null,
        isLoading: false,
        payload: action.payload,
      }
    case 'failed':
      return {
        ...state,
        errorMessage: action.message,
        isLoading: false,
      }
  }
}

export function useAdminResource<T>(path: string, fallbackMessage: string): [AdminResourceState<T>, () => void] {
  const [state, dispatch] = useReducer(adminResourceReducer<T>, undefined, (): AdminResourceState<T> => {
    const payload = readCachedAdminJson<T>(path)

    return {
      errorMessage: null,
      isLoading: payload === null,
      payload,
    }
  })
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    const controller = new AbortController()

    dispatch({ type: 'loading' })

    void fetchAdminJsonWithRetry<T>(path, { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) {
          dispatch({ payload, type: 'loaded' })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        dispatch({
          message: error instanceof Error
            ? error.message
            : fallbackMessage,
          type: 'failed',
        })
      })

    return () => controller.abort()
  }, [path, fallbackMessage, reloadToken])

  return [state, reload]
}
