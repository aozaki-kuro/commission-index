import { type RefObject, useCallback, useEffect, useRef } from 'react'

type FocusInputOptions = {
  preventScroll?: boolean
}

interface UseSuggestionPanelControllerOptions {
  inputRef: RefObject<HTMLInputElement | null>
  shouldShowSuggestionPanel: boolean
  dismissSuggestionPanel: () => void
}

export const useSuggestionPanelController = ({
  inputRef,
  shouldShowSuggestionPanel,
  dismissSuggestionPanel,
}: UseSuggestionPanelControllerOptions) => {
  const searchRootRef = useRef<HTMLElement>(null)
  const suppressNextInputFocusOpenRef = useRef(false)

  const focusInputAfterSelection = useCallback(
    (nextQuery: string, options?: FocusInputOptions) => {
      suppressNextInputFocusOpenRef.current = true

      requestAnimationFrame(() => {
        const input = inputRef.current
        if (input) {
          input.focus(options)
          const cursor = nextQuery.length
          input.setSelectionRange(cursor, cursor)
        }

        requestAnimationFrame(() => {
          suppressNextInputFocusOpenRef.current = false
        })
      })
    },
    [inputRef],
  )

  const shouldSuppressInputFocusOpen = useCallback(() => {
    if (!suppressNextInputFocusOpenRef.current) return false
    suppressNextInputFocusOpenRef.current = false
    return true
  }, [])

  useEffect(() => {
    if (!shouldShowSuggestionPanel) return

    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (searchRootRef.current?.contains(target)) return
      dismissSuggestionPanel()
    }

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      dismissSuggestionPanel()
    }

    window.addEventListener('pointerdown', handleWindowPointerDown, true)
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown, true)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [dismissSuggestionPanel, shouldShowSuggestionPanel])

  return {
    focusInputAfterSelection,
    searchRootRef,
    shouldSuppressInputFocusOpen,
  }
}
