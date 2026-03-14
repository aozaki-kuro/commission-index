import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedBatchCount,
  readActiveCharactersLoadedState,
} from '#features/home/commission/activeCharactersEvent'
import {
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
  readStaleCharactersLoadedBatchCount,
  readStaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { useEffect, useState } from 'react'

const readCharacterPanelActiveSnapshot = () => ({
  loaded: readActiveCharactersLoadedState(),
  batchCount: readActiveCharactersLoadedBatchCount(),
})

const readCharacterPanelStaleSnapshot = () => {
  const state = readStaleCharactersState()
  return {
    loaded: state.loaded,
    visible: state.visibility === 'visible',
    batchCount: readStaleCharactersLoadedBatchCount(),
  }
}

const getTimelinePanelLoaded = () => {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')?.dataset
      .timelineLoaded === 'true'
  )
}

const readPanelLoadedStateSnapshot = () => {
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

export const useSearchPanelLoadedState = () => {
  const [panelLoadedState, setPanelLoadedState] = useState(readPanelLoadedStateSnapshot)

  useEffect(() => {
    const syncActiveLoaded = () => {
      const snapshot = readCharacterPanelActiveSnapshot()
      setPanelLoadedState(previous => ({
        ...previous,
        activeLoaded: snapshot.loaded,
        activeBatchCount: snapshot.batchCount,
      }))
    }

    syncActiveLoaded()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)

    return () => {
      window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)
    }
  }, [])

  useEffect(() => {
    const syncStaleLoaded = () => {
      const snapshot = readCharacterPanelStaleSnapshot()
      setPanelLoadedState(previous => ({
        ...previous,
        staleLoaded: snapshot.loaded,
        staleVisible: snapshot.visible,
        staleBatchCount: snapshot.batchCount,
      }))
    }

    syncStaleLoaded()
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, syncStaleLoaded)
    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, syncStaleLoaded)
    window.addEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncStaleLoaded)

    return () => {
      window.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, syncStaleLoaded)
      window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, syncStaleLoaded)
      window.removeEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncStaleLoaded)
    }
  }, [])

  useEffect(() => {
    const syncTimelineLoaded = () => {
      setPanelLoadedState(previous => ({
        ...previous,
        timelineLoaded: getTimelinePanelLoaded(),
      }))
    }

    syncTimelineLoaded()
    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, syncTimelineLoaded)

    return () => {
      window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, syncTimelineLoaded)
    }
  }, [])

  return {
    activeLoaded: panelLoadedState.activeLoaded,
    activeBatchCount: panelLoadedState.activeBatchCount,
    staleLoaded: panelLoadedState.staleLoaded,
    staleVisible: panelLoadedState.staleVisible,
    staleBatchCount: panelLoadedState.staleBatchCount,
    timelineLoaded: panelLoadedState.timelineLoaded,
  }
}
