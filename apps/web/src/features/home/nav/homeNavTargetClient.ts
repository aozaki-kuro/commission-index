import type { ArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
import { ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT } from '@features/home/commission/archivedCharactersState'

const HOME_NAV_TARGET_WAIT_TIMEOUT_MS = 10000

interface RevealArchivedHomeNavTargetOptions {
  isReady?: () => boolean
  onVisible: () => void
  requestArchivedVisibility: (win: Window, visibility: ArchivedCharactersVisibility) => void
  timeoutMs?: number
  win: Window
}

export function revealArchivedHomeNavTarget({
  isReady,
  onVisible,
  requestArchivedVisibility,
  timeoutMs = HOME_NAV_TARGET_WAIT_TIMEOUT_MS,
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

    if (isReady && !isReady()) {
      return
    }

    cleanup()
    onVisible()
  }

  win.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, handleShown)
  timeoutHandle = win.setTimeout(cleanup, timeoutMs)

  try {
    requestArchivedVisibility(win, 'visible')
  }
  catch (error) {
    cleanup()
    throw error
  }
}
