type JumpToCommissionSearchOptions = {
  topGap?: number
  focusDelayMs?: number
  focusMode?: 'deferred' | 'immediate' | 'none'
}

const DEFAULT_TOP_GAP = 24
const DEFAULT_FOCUS_DELAY_MS = 160
const DEFAULT_FOCUS_MODE: JumpToCommissionSearchOptions['focusMode'] = 'deferred'

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
    input.click()
    const cursor = input.value.length
    input.setSelectionRange(cursor, cursor)
  }

  if (focusMode === 'immediate') {
    focusInput(false)
    requestAnimationFrame(() => scrollToTarget('auto'))
    window.setTimeout(() => scrollToTarget('auto'), 100)
    return
  }

  scrollToTarget()

  if (focusMode === 'none') return

  window.setTimeout(() => {
    focusInput(false)
    requestAnimationFrame(() => scrollToTarget('auto'))
    window.setTimeout(() => scrollToTarget('auto'), 100)
  }, focusDelayMs)
}
