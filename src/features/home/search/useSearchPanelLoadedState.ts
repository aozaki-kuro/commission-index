import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedState,
} from '#features/home/commission/activeCharactersEvent'
import {
  readDeferredSectionEntriesTemplateCount,
  SECTION_ENTRIES_LOADED_EVENT,
} from '#features/home/commission/sectionEntriesEvent'
import {
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
  readStaleCharactersState,
} from '#features/home/commission/staleCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '#features/home/commission/timelineViewLoader'
import { useEffect, useState } from 'react'

const getCharacterPanelActiveLoaded = () => readActiveCharactersLoadedState()
const getPendingSectionEntriesCount = () => readDeferredSectionEntriesTemplateCount()
const getCharacterPanelStaleLoaded = () => readStaleCharactersState().loaded

const getTimelinePanelLoaded = () => {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')?.dataset
      .timelineLoaded === 'true'
  )
}

export const useSearchPanelLoadedState = () => {
  const [activeLoaded, setActiveLoaded] = useState(getCharacterPanelActiveLoaded)
  const [pendingSectionEntriesCount, setPendingSectionEntriesCount] = useState(
    getPendingSectionEntriesCount,
  )
  const [staleLoaded, setStaleLoaded] = useState(getCharacterPanelStaleLoaded)
  const [timelineLoaded, setTimelineLoaded] = useState(getTimelinePanelLoaded)

  useEffect(() => {
    const syncActiveLoaded = () => {
      setActiveLoaded(getCharacterPanelActiveLoaded())
    }

    syncActiveLoaded()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)

    return () => {
      window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncActiveLoaded)
    }
  }, [])

  useEffect(() => {
    const syncPendingSectionEntriesCount = () => {
      setPendingSectionEntriesCount(getPendingSectionEntriesCount())
    }

    syncPendingSectionEntriesCount()
    window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncPendingSectionEntriesCount)
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, syncPendingSectionEntriesCount)
    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, syncPendingSectionEntriesCount)
    window.addEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncPendingSectionEntriesCount)
    window.addEventListener(SECTION_ENTRIES_LOADED_EVENT, syncPendingSectionEntriesCount)

    return () => {
      window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, syncPendingSectionEntriesCount)
      window.removeEventListener(
        STALE_CHARACTERS_STATE_CHANGE_EVENT,
        syncPendingSectionEntriesCount,
      )
      window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, syncPendingSectionEntriesCount)
      window.removeEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, syncPendingSectionEntriesCount)
      window.removeEventListener(SECTION_ENTRIES_LOADED_EVENT, syncPendingSectionEntriesCount)
    }
  }, [])

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
    activeLoaded,
    pendingSectionEntriesCount,
    staleLoaded,
    timelineLoaded,
  }
}
