import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  readActiveCharactersLoadedBatchCount,
  readActiveCharactersLoadedState,
} from '@features/home/commission/loader/activeCharactersEvent'
import {
  ARCHIVED_CHARACTERS_COLLAPSED_EVENT,
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
  isArchivedCharactersVisible,
} from '@features/home/commission/loader/archivedCharactersEvent'
import { TIMELINE_VIEW_LOADED_EVENT } from '@features/home/commission/loader/timelineViewLoader'

export interface PanelLoadedState {
  activeLoaded: boolean
  activeBatchCount: number
  archivedVisible: boolean
  timelineLoaded: boolean
}

type Subscriber = (state: PanelLoadedState) => void

function readActiveSnapshot() {
  return {
    loaded: readActiveCharactersLoadedState(),
    batchCount: readActiveCharactersLoadedBatchCount(),
  }
}

function getTimelinePanelLoaded() {
  if (typeof document === 'undefined')
    return false
  return (
    document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')?.dataset.timelineLoaded === 'true'
  )
}

export function readPanelLoadedState(): PanelLoadedState {
  const active = readActiveSnapshot()
  return {
    activeLoaded: active.loaded,
    activeBatchCount: active.batchCount,
    archivedVisible: isArchivedCharactersVisible(),
    timelineLoaded: getTimelinePanelLoaded(),
  }
}

// ==================== Lazy event subscription ====================
// Listeners are only bound when at least one subscriber exists,
// and torn down when the last subscriber unsubscribes.

const subscribers = new Set<Subscriber>()
let teardown: (() => void) | null = null

function notify() {
  const state = readPanelLoadedState()
  for (const fn of subscribers)
    fn(state)
}

function bind() {
  window.addEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, notify)
  window.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, notify)
  window.addEventListener(ARCHIVED_CHARACTERS_COLLAPSED_EVENT, notify)
  window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, notify)

  teardown = () => {
    window.removeEventListener(ACTIVE_CHARACTERS_LOADED_EVENT, notify)
    window.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, notify)
    window.removeEventListener(ARCHIVED_CHARACTERS_COLLAPSED_EVENT, notify)
    window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, notify)
    teardown = null
  }
}

export function subscribePanelState(fn: Subscriber): () => void {
  subscribers.add(fn)

  // Lazy: bind listeners on first subscriber
  if (subscribers.size === 1)
    bind()

  return () => {
    subscribers.delete(fn)

    // Tear down when last subscriber leaves
    if (subscribers.size === 0)
      teardown?.()
  }
}
