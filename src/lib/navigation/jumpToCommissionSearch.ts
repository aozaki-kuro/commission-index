type JumpToCommissionSearchOptions = {
  topGap?: number
  focusDelayMs?: number
  focusMode?: 'deferred' | 'immediate' | 'none'
}

const DEFAULT_TOP_GAP = 24
const DEFAULT_FOCUS_DELAY_MS = 160
const DEFAULT_FOCUS_MODE: JumpToCommissionSearchOptions['focusMode'] = 'deferred'
const shouldUseTapLikeFocus = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const hasTouchPoints = navigator.maxTouchPoints > 0
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return hasTouchPoints || hasCoarsePointer
}

export const jumpToCommissionSearch = ({
  topGap = DEFAULT_TOP_GAP,
  focusDelayMs = DEFAULT_FOCUS_DELAY_MS,
  focusMode = DEFAULT_FOCUS_MODE,
}: JumpToCommissionSearchOptions = {}) => {
  const searchSection = document.getElementById('commission-search')
  if (!searchSection) return

  const getTargetTop = () =>
    Math.max(0, window.scrollY + searchSection.getBoundingClientRect().top - topGap)
  const scrollToTarget = (behavior: ScrollBehavior = 'smooth') => {
    window.scrollTo({ top: getTargetTop(), behavior })
  }

  const getSearchInput = () => {
    const searchInput = document.getElementById('commission-search-input')
    return searchInput instanceof HTMLInputElement ? searchInput : null
  }

  const focusInput = (preventScroll: boolean) => {
    const input = getSearchInput()
    if (!input) return

    input.focus({ preventScroll })
    // iOS Safari can ignore plain focus unless input receives a direct tap-like activation.
    if (shouldUseTapLikeFocus()) {
      input.click()
    }
    const cursor = input.value.length
    input.setSelectionRange(cursor, cursor)
  }

  if (focusMode === 'immediate') {
    // Keep focus in the same user activation turn on mobile keyboards.
    scrollToTarget('auto')
    focusInput(true)
    return
  }

  scrollToTarget()

  if (focusMode === 'none') return

  window.setTimeout(() => {
    focusInput(true)
    requestAnimationFrame(() => scrollToTarget('auto'))
    window.setTimeout(() => scrollToTarget('auto'), 100)
  }, focusDelayMs)
}
