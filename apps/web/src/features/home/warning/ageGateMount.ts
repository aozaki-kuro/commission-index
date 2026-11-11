import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'
import { CONFIRMED_AGE_KEY, CONFIRMED_IN_MEMORY_FLAG, hasValidAgeConfirmation, readStoredAgeConfirmation, writeStoredAgeConfirmation } from './ageGate'

const AGE_CONFIRM_EVENT = 'age-confirm-changed'
export const AGE_GATE_STATE_EVENT = 'age-gate-state-change'
const INITIAL_ATTRIBUTE = 'ageGateInitial'

const memoryFlags = window as unknown as Record<string, unknown>

// The gate renders inside <main>, so no single container can go inert: walk up from the gate and inert
// every sibling along the way (listing, floating buttons, anything outside <main>). Elements that were
// already inert are skipped so release never clears an `inert` someone else owns (e.g. the closed hamburger).
function inertOutside(root: HTMLElement): HTMLElement[] {
  const marked: HTMLElement[] = []
  for (let node: HTMLElement | null = root; node && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.hasAttribute('inert'))
        continue
      sibling.setAttribute('inert', '')
      marked.push(sibling)
    }
  }
  return marked
}

// Elements are queried per mount: after a soft navigation the old nodes are gone.
export function mountAgeGate(): (() => void) | null {
  const root = document.querySelector<HTMLElement>('[data-age-gate-root]')
  const overlay = root?.querySelector<HTMLElement>('[data-age-gate-overlay]')
  const panel = root?.querySelector<HTMLElement>('[data-age-gate-panel]')
  const confirmButton = root?.querySelector<HTMLButtonElement>('[data-age-gate-confirm]')
  const leaveButton = root?.querySelector<HTMLButtonElement>('[data-age-gate-leave]')

  if (!root || !overlay || !panel || !confirmButton || !leaveButton) {
    console.warn('[age-gate] root elements are missing')
    return null
  }

  let hasOpened = false
  let isOpen = false
  let inertElements: HTMLElement[] = []
  const originalHtmlOverflow = document.documentElement.style.overflow
  const originalBodyOverflow = document.body.style.overflow

  const releaseInert = () => {
    for (const element of inertElements)
      element.removeAttribute('inert')
    inertElements = []
  }

  // Unreadable storage opens the gate (matches the pre-paint script); a confirmation that storage could
  // not persist lives in a window flag so it also survives soft navigations, which remount this island.
  const isConfirmed = () => hasValidAgeConfirmation({
    userAgent: navigator.userAgent,
    storedValue: readStoredAgeConfirmation(() => localStorage),
    now: Date.now(),
    confirmedInMemory: memoryFlags[CONFIRMED_IN_MEMORY_FLAG] === true,
  })

  // The pre-paint script may already show the gate. Adopt that frame as-is: the entrance animation
  // would restart from opacity 0 once the opt-in attribute (which forces animation: none) is removed,
  // so keep it suppressed inline until the next state change.
  let entranceSuppressed = false
  const releaseEntranceSuppression = () => {
    if (!entranceSuppressed)
      return
    overlay.style.removeProperty('animation')
    panel.style.removeProperty('animation')
    entranceSuppressed = false
  }

  const updateState = (open: boolean) => {
    const adoptingInitial = document.documentElement.dataset[INITIAL_ATTRIBUTE] === 'open'
    if (adoptingInitial && open && !isOpen) {
      overlay.style.animation = 'none'
      panel.style.animation = 'none'
      entranceSuppressed = true
    }
    else {
      releaseEntranceSuppression()
    }
    delete document.documentElement.dataset[INITIAL_ATTRIBUTE]
    isOpen = open
    // Once per mount: `shown` minus `confirmed` is how many visitors the gate turned away.
    if (open && !hasOpened)
      trackRybbitEvent(ANALYTICS_EVENTS.ageGate, { action: 'shown' })
    if (open)
      hasOpened = true

    const shouldRender = open || hasOpened
    root.classList.toggle('hidden', !shouldRender)
    root.classList.toggle('flex', shouldRender)
    root.classList.toggle('pointer-events-none', !open)
    root.classList.toggle('pointer-events-auto', open)

    const state = open ? 'open' : 'closed'
    root.dataset.state = state
    root.setAttribute('aria-hidden', open ? 'false' : 'true')
    overlay.dataset.state = state
    panel.dataset.state = state
    document.documentElement.dataset.ageGateOpen = open ? 'true' : 'false'
    window.dispatchEvent(
      new CustomEvent(AGE_GATE_STATE_EVENT, {
        detail: { open },
      }),
    )

    if (open) {
      if (inertElements.length === 0)
        inertElements = inertOutside(root)
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      confirmButton.focus()
      return
    }

    releaseInert()
    document.documentElement.style.overflow = originalHtmlOverflow
    document.body.style.overflow = originalBodyOverflow
  }

  const syncOpenState = () => {
    updateState(!isConfirmed())
  }

  const onConfirmAge = () => {
    trackRybbitEvent(ANALYTICS_EVENTS.ageGate, { action: 'confirmed' })
    if (!writeStoredAgeConfirmation(() => localStorage, String(Date.now())))
      memoryFlags[CONFIRMED_IN_MEMORY_FLAG] = true
    window.dispatchEvent(new Event(AGE_CONFIRM_EVENT))
  }

  const onLeave = () => {
    window.location.href = 'https://www.google.com'
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CONFIRMED_AGE_KEY)
      return
    syncOpenState()
  }

  const getFocusableElements = () =>
    [
      ...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isOpen)
      return

    if (event.key === 'Escape') {
      event.preventDefault()
      return
    }

    if (event.key !== 'Tab')
      return

    const focusable = getFocusableElements()
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) {
      event.preventDefault()
      return
    }
    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }

    if (active === last || !panel.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

  confirmButton.addEventListener('click', onConfirmAge)
  leaveButton.addEventListener('click', onLeave)
  window.addEventListener('storage', onStorage)
  window.addEventListener(AGE_CONFIRM_EVENT, syncOpenState)
  document.addEventListener('keydown', onKeyDown)
  syncOpenState()

  return () => {
    confirmButton.removeEventListener('click', onConfirmAge)
    leaveButton.removeEventListener('click', onLeave)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(AGE_CONFIRM_EVENT, syncOpenState)
    document.removeEventListener('keydown', onKeyDown)
    delete document.documentElement.dataset.ageGateOpen
    delete document.documentElement.dataset[INITIAL_ATTRIBUTE]
    releaseEntranceSuppression()
    releaseInert()
    document.documentElement.style.overflow = originalHtmlOverflow
    document.body.style.overflow = originalBodyOverflow
  }
}
