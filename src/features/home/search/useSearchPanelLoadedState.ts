import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedBatchCount,
  readActiveCharactersLoadedState,
} from '#features/home/commission/activeCharactersEvent'
import {
  readStaleCharactersLoadedBatchCount,
  readStaleCharactersState,
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { useCallback, useEffect, useLayoutEffect, useReducer } from 'react'

const useSafeLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface PanelLoadedState {
  activeLoaded: boolean
  activeBatchCount: number
  staleLoaded: boolean
  staleVisible: boolean
  staleBatchCount: number
  timelineLoaded: boolean
}

type PanelLoadedStateAction
  = | { type: 'sync-active', value: { batchCount: number, loaded: boolean } }
    | { type: 'sync-stale', value: { batchCount: number, loaded: boolean, visible: boolean } }
    | { type: 'sync-timeline', value: boolean }

function readCharacterPanelActiveSnapshot() {
  return {
    loaded: readActiveCharactersLoadedState(),
    batchCount: readActiveCharactersLoadedBatchCount(),
  }
}

function readCharacterPanelStaleSnapshot() {
  const state = readStaleCharactersState()
  return {
    loaded: state.loaded,
    visible: state.visibility === 'visible',
    batchCount: readStaleCharactersLoadedBatchCount(),
  }
}

function getTimelinePanelLoaded() {
  if (typeof document === 'undefined')
    return false
  return (
    document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')?.dataset.timelineLoaded === 'true'
  )
}

function readPanelLoadedStateSnapshot(): PanelLoadedState {
  const active = readCharacterPanelActiveSnapshot()
  const stale = readCharacterPanelStaleSnapshot()
  return {
    activeLoaded: active.loaded,
    activeBatchCount: active.batchCount,
    staleLoaded: stale.loaded,
    staleVisible: stale.visible,
    staleBatchCount: stale.batchCount,
    timelineLoaded: getTimelinePanelLoaded(),
  }
}

function panelLoadedStateReducer(
  state: PanelLoadedState,
  action: PanelLoadedStateAction,
): PanelLoadedState {
  if (action.type === 'sync-active') {
    return {
      ...state,
      activeLoaded: action.value.loaded,
      activeBatchCount: action.value.batchCount,
    }
  }

  if (action.type === 'sync-stale') {
    return {
      ...state,
      staleLoaded: action.value.loaded,
      staleVisible: action.value.visible,
      staleBatchCount: action.value.batchCount,
    }
  }

  return {
    ...state,
    timelineLoaded: action.value,
  }
}

export function useSearchPanelLoadedState() {
  const [panelLoadedState, dispatchPanelLoadedState] = useReducer(
    panelLoadedStateReducer,
    undefined,
    readPanelLoadedStateSnapshot,
  )
  const syncActiveLoaded = useCallback(() => {
    const snapshot = readCharacterPanelActiveSnapshot()
    dispatchPanelLoadedState({
      type: 'sync-active',
      value: snapshot,
    })
  }, [])

  const syncStaleLoaded = useCallback(() => {
    const snapshot = readCharacterPanelStaleSnapshot()
    dispatchPanelLoadedState({
      type: 'sync-stale',
      value: snapshot,
    })
  }, [])

  const syncTimelineLoaded = useCallback(() => {
    dispatchPanelLoadedState({
      type: 'sync-timeline',
      value: getTimelinePanelLoaded(),
    })
  }, [])

  useSafeLayoutEffect(() => {
    syncActiveLoaded()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)

    return () => {
      window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)
    }
  }, [syncActiveLoaded])

  useSafeLayoutEffect(() => {
    syncStaleLoaded()
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, syncStaleLoaded)
    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, syncStaleLoaded)
    window.addEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncStaleLoaded)

    return () => {
      window.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, syncStaleLoaded)
      window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, syncStaleLoaded)
      window.removeEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncStaleLoaded)
    }
  }, [syncStaleLoaded])

  useSafeLayoutEffect(() => {
    syncTimelineLoaded()
    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, syncTimelineLoaded)

    return () => {
      window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, syncTimelineLoaded)
    }
  }, [syncTimelineLoaded])

  return {
    activeLoaded: panelLoadedState.activeLoaded,
    activeBatchCount: panelLoadedState.activeBatchCount,
    staleLoaded: panelLoadedState.staleLoaded,
    staleVisible: panelLoadedState.staleVisible,
    staleBatchCount: panelLoadedState.staleBatchCount,
    timelineLoaded: panelLoadedState.timelineLoaded,
  }
}
