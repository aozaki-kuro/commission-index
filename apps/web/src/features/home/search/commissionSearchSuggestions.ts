interface FocusInputOptions {
  preventScroll?: boolean
}

interface SuggestionPanelController {
  focusInputAfterSelection: (nextQuery: string, options?: FocusInputOptions) => void
  shouldSuppressInputFocusOpen: () => boolean
  bindOutsideListeners: (searchRoot: HTMLElement, dismissFn: () => void) => void
  unbindOutsideListeners: () => void
  dispose: () => void
}

export function createSuggestionPanelController(
  inputEl: HTMLInputElement,
): SuggestionPanelController {
  let suppressNextFocusOpen = false
  let pointerHandler: ((e: PointerEvent) => void) | null = null
  let keyHandler: ((e: KeyboardEvent) => void) | null = null
  let focusRafId = 0

  function focusInputAfterSelection(nextQuery: string, options?: FocusInputOptions) {
    suppressNextFocusOpen = true

    if (focusRafId)
      cancelAnimationFrame(focusRafId)
    focusRafId = requestAnimationFrame(() => {
      inputEl.focus(options)
      const cursor = nextQuery.length
      inputEl.setSelectionRange(cursor, cursor)

      focusRafId = requestAnimationFrame(() => {
        focusRafId = 0
        suppressNextFocusOpen = false
      })
    })
  }

  function shouldSuppressInputFocusOpen(): boolean {
    if (!suppressNextFocusOpen)
      return false
    suppressNextFocusOpen = false
    return true
  }

  function bindOutsideListeners(searchRoot: HTMLElement, dismissFn: () => void) {
    unbindOutsideListeners()

    pointerHandler = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node))
        return
      if (searchRoot.contains(target))
        return
      dismissFn()
    }

    keyHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape')
        return
      dismissFn()
    }

    window.addEventListener('pointerdown', pointerHandler, true)
    window.addEventListener('keydown', keyHandler)
  }

  function unbindOutsideListeners() {
    if (pointerHandler) {
      window.removeEventListener('pointerdown', pointerHandler, true)
      pointerHandler = null
    }
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler)
      keyHandler = null
    }
  }

  return {
    focusInputAfterSelection,
    shouldSuppressInputFocusOpen,
    bindOutsideListeners,
    unbindOutsideListeners,
    dispose() {
      unbindOutsideListeners()
      if (focusRafId)
        cancelAnimationFrame(focusRafId)
      focusRafId = 0
    },
  }
}
