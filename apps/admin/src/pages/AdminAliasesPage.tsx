import type { AdminAliasesData } from '@commission-index/domain'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { AdminAliasesDashboard } from '../components/AdminAliasesDashboard'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { fetchAdminJsonWithRetry, readCachedAdminJson } from '../lib/adminApi'
import { subscribeToDataUpdates } from '../lib/dataUpdateSignal'

const aliasesCacheKey = '/api/admin/aliases/bootstrap'
const emptyAliases: AdminAliasesData = { characterAliases: [], creatorAliases: [], keywordAliases: [] }

interface AliasesState {
  errorMessage: string | null
  isLoading: boolean
  payload: AdminAliasesData | null
}

type AliasesAction
  = { type: 'loading' }
    | { payload: AdminAliasesData, type: 'loaded' }
    | { message: string, type: 'failed' }

function createInitialAliasesState(): AliasesState {
  const payload = readCachedAdminJson<AdminAliasesData>(aliasesCacheKey)

  return {
    errorMessage: null,
    isLoading: payload === null,
    payload,
  }
}

function aliasesReducer(state: AliasesState, action: AliasesAction): AliasesState {
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

export function AdminAliasesPage() {
  const [state, dispatch] = useReducer(aliasesReducer, undefined, createInitialAliasesState)
  const [reloadToken, setReloadToken] = useState(0)
  const refreshData = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => subscribeToDataUpdates(refreshData), [refreshData])

  useEffect(() => {
    const controller = new AbortController()
    let isDisposed = false

    dispatch({ type: 'loading' })

    void fetchAdminJsonWithRetry<AdminAliasesData>(aliasesCacheKey, {
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
          message: error instanceof Error ? error.message : 'Failed to load alias data.',
          type: 'failed',
        })
      })

    return () => {
      isDisposed = true
      controller.abort()
    }
  }, [reloadToken])

  const payload = state.payload ?? emptyAliases
  return (
    <>
      <AdminBootstrapStatus errorMessage={state.errorMessage} isLoading={state.isLoading} hasPayload={state.payload !== null} onRetry={refreshData} />
      <AdminAliasesDashboard
        characters={payload.characterAliases}
        creators={payload.creatorAliases}
        keywords={payload.keywordAliases}
        isLoading={!state.payload && state.isLoading}
        isUnavailable={!state.payload && Boolean(state.errorMessage)}
        onSaved={refreshData}
      />
    </>
  )
}
