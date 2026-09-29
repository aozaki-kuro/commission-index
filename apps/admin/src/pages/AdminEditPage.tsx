import type { AdminBootstrapData } from '@commission-index/domain'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AdminBootstrapStatus } from '../components/AdminBootstrapStatus'
import { AdminEditDashboard } from '../components/AdminEditDashboard'
import { fetchAdminJsonWithRetry, readCachedAdminJson } from '../lib/adminApi'
import { subscribeToDataUpdates } from '../lib/dataUpdateSignal'

const scrollStorageKey = 'admin-dashboard-scroll'
const scrollExpiryMs = 10 * 60 * 1000
const scrollPersistThrottleMs = 200
const bootstrapCacheKey = '/api/admin/bootstrap'

interface EditState {
  errorMessage: string | null
  isLoading: boolean
  payload: AdminBootstrapData | null
}

interface StoredScrollState {
  timestamp: number
  top: number
  anchor?: { id: number, offset: number, type: 'character' | 'commission' }
}

type EditAction
  = { type: 'loading' }
    | { payload: AdminBootstrapData, type: 'loaded' }
    | { message: string, type: 'failed' }

function createInitialEditState(): EditState {
  const payload = readCachedAdminJson<AdminBootstrapData>(bootstrapCacheKey)

  return {
    errorMessage: null,
    isLoading: payload === null,
    payload,
  }
}

function getCurrentScrollTop() {
  return Math.max(window.scrollY, window.pageYOffset, 0)
}

function isReloadNavigation() {
  if (typeof window === 'undefined' || typeof performance === 'undefined') {
    return false
  }

  const navigationEntry = performance.getEntriesByType('navigation')[0]
  return navigationEntry instanceof PerformanceNavigationTiming
    ? navigationEntry.type === 'reload'
    : false
}

function readStoredScrollState(): StoredScrollState | null {
  if (typeof window === 'undefined' || !isReloadNavigation()) {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<StoredScrollState>
    const timestamp = Number(parsed.timestamp)
    const top = Number(parsed.top)
    if (!Number.isFinite(timestamp) || !Number.isFinite(top)) {
      return null
    }

    if (Date.now() - timestamp > scrollExpiryMs) {
      return null
    }

    const anchor = parsed.anchor
    return {
      anchor: anchor && Number.isInteger(anchor.id) && anchor.id > 0 && Number.isFinite(anchor.offset)
        && (anchor.type === 'character' || anchor.type === 'commission')
        ? anchor as StoredScrollState['anchor']
        : undefined,
      timestamp,
      top: Math.max(0, top),
    }
  }
  catch {
    return null
  }
}

function writeStoredScrollTop() {
  if (typeof window === 'undefined') {
    return
  }

  const visibleAnchor = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return { element, rect }
    })
    .find(({ rect }) => rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight)
  const anchor = visibleAnchor('[data-commission-id]') ?? visibleAnchor('[data-character-id]')
  const state: StoredScrollState = {
    anchor: anchor
      ? {
          id: Number(anchor.element.dataset.characterId ?? anchor.element.dataset.commissionId),
          offset: anchor.rect.top,
          type: anchor.element.dataset.characterId ? 'character' : 'commission',
        }
      : undefined,
    timestamp: Date.now(),
    top: getCurrentScrollTop(),
  }
  try {
    window.sessionStorage.setItem(scrollStorageKey, JSON.stringify(state))
  }
  catch {
    // 存储不可用时不影响页面编辑。
  }
}

function editReducer(state: EditState, action: EditAction): EditState {
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

export function AdminEditPage({ onReady }: { onReady?: () => void }) {
  const [state, dispatch] = useReducer(editReducer, undefined, createInitialEditState)
  const [reloadToken, setReloadToken] = useState(0)
  const [pendingScrollState] = useState<StoredScrollState | null>(() => readStoredScrollState())
  const [hasRestoredScroll, setHasRestoredScroll] = useState(false)
  const cancelledScrollRestoreRef = useRef(false)
  const [areOpenGroupsLoaded, setAreOpenGroupsLoaded] = useState(false)
  const markOpenGroupsLoaded = useCallback(() => setAreOpenGroupsLoaded(true), [])
  const refreshData = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    if (state.payload && areOpenGroupsLoaded) {
      onReady?.()
    }
  }, [areOpenGroupsLoaded, onReady, state.payload])

  useEffect(() => {
    if (!pendingScrollState || hasRestoredScroll) {
      return
    }
    const cancel = () => {
      cancelledScrollRestoreRef.current = true
      setHasRestoredScroll(true)
    }
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchstart', cancel, { passive: true })
    window.addEventListener('pointerdown', cancel, { passive: true })
    window.addEventListener('keydown', cancel)
    return () => {
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('pointerdown', cancel)
      window.removeEventListener('keydown', cancel)
    }
  }, [hasRestoredScroll, pendingScrollState])

  useEffect(() => subscribeToDataUpdates(refreshData), [refreshData])

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

  useEffect(() => {
    if (typeof window === 'undefined' || (pendingScrollState && !hasRestoredScroll)) {
      return
    }

    let timeoutId: number | null = null
    let savedBeforeUnload = false

    const persistNow = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      writeStoredScrollTop()
    }

    const schedulePersist = () => {
      if (timeoutId !== null) {
        return
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = null
        writeStoredScrollTop()
      }, scrollPersistThrottleMs)
    }

    const persistBeforeUnload = () => {
      persistNow()
      savedBeforeUnload = true
    }
    const persistOnPageHide = () => {
      // pagehide 阶段字体可能已卸载，不能用临时几何覆盖 beforeunload 的稳定快照。
      if (!savedBeforeUnload)
        persistNow()
    }
    const resetNavigationSave = () => {
      savedBeforeUnload = false
    }

    window.addEventListener('scroll', schedulePersist, { passive: true })
    window.addEventListener('pagehide', persistOnPageHide)
    window.addEventListener('beforeunload', persistBeforeUnload)
    window.addEventListener('pageshow', resetNavigationSave)

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      window.removeEventListener('scroll', schedulePersist)
      window.removeEventListener('pagehide', persistOnPageHide)
      window.removeEventListener('beforeunload', persistBeforeUnload)
      window.removeEventListener('pageshow', resetNavigationSave)
    }
  }, [hasRestoredScroll, pendingScrollState])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!pendingScrollState || hasRestoredScroll || !state.payload || !areOpenGroupsLoaded) {
      return
    }

    const restore = () => {
      if (cancelledScrollRestoreRef.current) {
        return
      }
      const { anchor } = pendingScrollState
      const target = anchor
        ? document.querySelector<HTMLElement>(anchor.type === 'character'
            ? `[data-character-id="${anchor.id}"]`
            : `[data-commission-id="${anchor.id}"]`)
        : null
      if (target && anchor) {
        window.scrollTo({
          behavior: 'auto',
          top: getCurrentScrollTop() + target.getBoundingClientRect().top - anchor.offset,
        })
      }
      else {
        window.scrollTo({ behavior: 'auto', top: pendingScrollState.top })
      }
      setHasRestoredScroll(true)
    }

    let disposed = false
    let frameId = 0
    // 等待有限的入场/展开动画结束，避免把动画位移保存为内容坐标。
    const animations = document.getAnimations?.().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity) ?? []
    void Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => {
      if (!disposed && !cancelledScrollRestoreRef.current) {
        frameId = window.requestAnimationFrame(restore)
      }
    })
    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
    }
  }, [areOpenGroupsLoaded, hasRestoredScroll, pendingScrollState, state.payload])

  return (
    <>
      <AdminBootstrapStatus
        errorMessage={state.errorMessage}
        isLoading={state.isLoading}
        hasPayload={state.payload !== null}
        onRetry={refreshData}
      />
      <AdminEditDashboard
        characters={state.payload?.characters ?? []}
        commissionSearchRows={state.payload?.commissionSearchRows ?? []}
        creatorAliases={state.payload?.creatorAliases ?? []}
        isInitialLoading={!state.payload && state.isLoading}
        isInitialError={!state.payload && Boolean(state.errorMessage)}
        onOpenGroupsLoaded={markOpenGroupsLoaded}
        onRefresh={refreshData}
      />
    </>
  )
}
