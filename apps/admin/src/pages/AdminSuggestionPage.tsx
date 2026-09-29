import type { HomeSuggestionAdminData } from '@commission-index/domain'
import { useEffect, useReducer, useState } from 'react'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { AdminSuggestionDashboard } from '../components/AdminSuggestionDashboard'
import { fetchAdminJsonWithRetry, readCachedAdminJson } from '../lib/adminApi'

const emptyKeywords: string[] = []

const suggestionCacheKey = '/api/admin/suggestion'

interface SuggestionState {
  errorMessage: string | null
  isLoading: boolean
  payload: HomeSuggestionAdminData | null
}

type SuggestionAction
  = { type: 'loading' }
    | { payload: HomeSuggestionAdminData, type: 'loaded' }
    | { message: string, type: 'failed' }

function createInitialSuggestionState(): SuggestionState {
  const payload = readCachedAdminJson<HomeSuggestionAdminData>(suggestionCacheKey)

  return {
    errorMessage: null,
    isLoading: payload === null,
    payload,
  }
}

function suggestionReducer(state: SuggestionState, action: SuggestionAction): SuggestionState {
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

export function AdminSuggestionPage() {
  const [state, dispatch] = useReducer(suggestionReducer, undefined, createInitialSuggestionState)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let isDisposed = false

    dispatch({ type: 'loading' })

    void fetchAdminJsonWithRetry<HomeSuggestionAdminData>(suggestionCacheKey, {
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
          message: error instanceof Error ? error.message : 'Failed to load suggestion data.',
          type: 'failed',
        })
      })

    return () => {
      isDisposed = true
      controller.abort()
    }
  }, [reloadToken])

  return (
    <>
      <AdminBootstrapStatus
        errorMessage={state.errorMessage}
        isLoading={state.isLoading}
        hasPayload={state.payload !== null}
        onRetry={() => setReloadToken(token => token + 1)}
      />
      <AdminSuggestionDashboard
        featuredKeywords={state.payload?.featuredKeywords ?? emptyKeywords}
        keywordOptions={state.payload?.keywordOptions ?? emptyKeywords}
        isReady={state.payload !== null}
        isLoading={state.isLoading}
      />
    </>
  )
}
