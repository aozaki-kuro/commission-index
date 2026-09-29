import type { AdminBootstrapData } from '@commission-index/domain'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { AdminCreateDashboard } from '../components/AdminCreateDashboard'
import { fetchAdminJsonWithRetry, readCachedAdminJson } from '../lib/adminApi'
import { subscribeToDataUpdates } from '../lib/dataUpdateSignal'

const bootstrapCacheKey = '/api/admin/bootstrap'

interface CreateState {
  errorMessage: string | null
  isLoading: boolean
  payload: AdminBootstrapData | null
}

type CreateAction
  = { type: 'loading' }
    | { payload: AdminBootstrapData, type: 'loaded' }
    | { message: string, type: 'failed' }

function createInitialCreateState(): CreateState {
  const payload = readCachedAdminJson<AdminBootstrapData>(bootstrapCacheKey)

  return {
    errorMessage: null,
    isLoading: payload === null,
    payload,
  }
}

function createReducer(state: CreateState, action: CreateAction): CreateState {
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

export function AdminCreatePage() {
  const [state, dispatch] = useReducer(createReducer, undefined, createInitialCreateState)
  const [reloadToken, setReloadToken] = useState(0)
  const reloadData = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => subscribeToDataUpdates(() => {
    setReloadToken(token => token + 1)
  }), [])

  useEffect(() => {
    const controller = new AbortController()
    let isDisposed = false

    dispatch({ type: 'loading' })

    void fetchAdminJsonWithRetry<AdminBootstrapData>(bootstrapCacheKey, {
      signal: controller.signal,
    })
      .then((payload) => {
        if (isDisposed) {
          return
        }

        dispatch({
          payload,
          type: 'loaded',
        })
      })
      .catch((error) => {
        if (isDisposed) {
          return
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        dispatch({
          message: error instanceof Error ? error.message : 'Failed to load admin data.',
          type: 'failed',
        })
      })

    return () => {
      isDisposed = true
      controller.abort()
    }
  }, [reloadToken])

  return (
    <AdminCreateDashboard
      characters={state.payload?.characters.map(character => ({
        id: character.id,
        name: character.name,
        sortOrder: character.sortOrder,
        status: character.status,
      })) ?? []}
      commissionSearchRows={state.payload?.commissionSearchRows ?? []}
      errorMessage={state.errorMessage}
      isLoading={state.isLoading}
      hasPayload={state.payload !== null}
      onRetry={reloadData}
    />
  )
}
