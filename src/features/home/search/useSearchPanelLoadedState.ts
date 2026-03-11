import {
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
  readStaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { useEffect, useState } from 'react'

const getCharacterPanelStaleLoaded = () => readStaleCharactersState().loaded

const getTimelinePanelLoaded = () => {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')?.dataset
      .timelineLoaded === 'true'
  )
}

export const useSearchPanelLoadedState = () => {
  const [staleLoaded, setStaleLoaded] = useState(getCharacterPanelStaleLoaded)
  const [timelineLoaded, setTimelineLoaded] = useState(getTimelinePanelLoaded)

  useEffect(() => {
    const syncStaleLoaded = () => {
      setStaleLoaded(getCharacterPanelStaleLoaded())
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
    staleLoaded,
    timelineLoaded,
  }
}
