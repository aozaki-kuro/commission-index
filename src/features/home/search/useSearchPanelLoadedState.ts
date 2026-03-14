import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedBatchCount,
  readActiveCharactersLoadedState,
} from '#features/home/commission/activeCharactersEvent'
import {
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
  isStaleCharactersVisible,
  readStaleCharactersLoadedBatchCount,
  readStaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { useEffect, useState } from 'react'

const getCharacterPanelActiveLoaded = () => readActiveCharactersLoadedState()
const getCharacterPanelActiveBatchCount = () => readActiveCharactersLoadedBatchCount()
const getCharacterPanelStaleLoaded = () => readStaleCharactersState().loaded
const getCharacterPanelStaleVisible = () => isStaleCharactersVisible()
const getCharacterPanelStaleBatchCount = () => readStaleCharactersLoadedBatchCount()

const getTimelinePanelLoaded = () => {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')?.dataset
      .timelineLoaded === 'true'
  )
}

export const useSearchPanelLoadedState = () => {
  const [activeLoaded, setActiveLoaded] = useState(getCharacterPanelActiveLoaded)
  const [activeBatchCount, setActiveBatchCount] = useState(getCharacterPanelActiveBatchCount)
  const [staleLoaded, setStaleLoaded] = useState(getCharacterPanelStaleLoaded)
  const [staleVisible, setStaleVisible] = useState(getCharacterPanelStaleVisible)
  const [staleBatchCount, setStaleBatchCount] = useState(getCharacterPanelStaleBatchCount)
  const [timelineLoaded, setTimelineLoaded] = useState(getTimelinePanelLoaded)

  useEffect(() => {
    const syncActiveLoaded = () => {
      setActiveLoaded(getCharacterPanelActiveLoaded())
      setActiveBatchCount(getCharacterPanelActiveBatchCount())
    }

    syncActiveLoaded()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)

    return () => {
      window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)
    }
  }, [])

  useEffect(() => {
    const syncStaleLoaded = () => {
      setStaleLoaded(getCharacterPanelStaleLoaded())
      setStaleVisible(getCharacterPanelStaleVisible())
      setStaleBatchCount(getCharacterPanelStaleBatchCount())
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
      setTimelineLoaded(getTimelinePanelLoaded())
    }

    syncTimelineLoaded()
    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, syncTimelineLoaded)

    return () => {
      window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, syncTimelineLoaded)
    }
  }, [])

  return {
    activeLoaded,
    activeBatchCount,
    staleLoaded,
    staleVisible,
    staleBatchCount,
    timelineLoaded,
  }
}
