import {
  ARCHIVED_CHARACTERS_COLLAPSED_EVENT,
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
  isArchivedCharactersVisible,
} from '@features/home/commission/archivedCharactersState'

export interface PanelLoadedState {
  archivedVisible: boolean
}

type Subscriber = (state: PanelLoadedState) => void

export function readPanelLoadedState(): PanelLoadedState {
  return {
    archivedVisible: isArchivedCharactersVisible(),
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
  window.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, notify)
  window.addEventListener(ARCHIVED_CHARACTERS_COLLAPSED_EVENT, notify)

  teardown = () => {
    window.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, notify)
    window.removeEventListener(ARCHIVED_CHARACTERS_COLLAPSED_EVENT, notify)
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
