import type { ArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
import { ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT } from '@features/home/commission/archivedCharactersState'

const HOME_NAV_TARGET_WAIT_TIMEOUT_MS = 10000

interface RevealArchivedHomeNavTargetOptions {
  onVisible: () => void
  requestArchivedVisibility: (win: Window, visibility: ArchivedCharactersVisibility) => void
  win: Window
}

export function revealArchivedHomeNavTarget({
  onVisible,
  requestArchivedVisibility,
  win,
}: RevealArchivedHomeNavTargetOptions) {
  let timeoutHandle: number | null = null

  function cleanup() {
    win.removeEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, handleShown)
    if (timeoutHandle !== null) {
      win.clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  }

  function handleShown(event: Event) {
    if (!(event instanceof CustomEvent) || event.detail?.visibility !== 'visible') {
      return
    }

    cleanup()
    onVisible()
  }

  win.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, handleShown)
  // Leak guard: a show request that never answers must not leave the listener behind.
  timeoutHandle = win.setTimeout(cleanup, HOME_NAV_TARGET_WAIT_TIMEOUT_MS)

  try {
    requestArchivedVisibility(win, 'visible')
  }
  catch (error) {
    cleanup()
    throw error
  }
}
