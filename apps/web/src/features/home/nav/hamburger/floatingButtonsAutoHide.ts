import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '@features/home/events'

const HAMBURGER_SELECTOR = '[data-mobile-hamburger="true"]'
const LANGUAGE_ROOT_SELECTOR = '[data-mobile-language-menu-root="true"]'
const LANGUAGE_MENU_SELECTOR = '[data-mobile-language-menu="true"]'
const AGE_GATE_ROOT_SELECTOR = '[data-age-gate-root]'
const HIDDEN_ATTRIBUTE = 'data-floating-hidden'

// Cumulative travel in one direction before the state flips; absorbs touch jitter.
const DIRECTION_THRESHOLD_PX = 8
const ALWAYS_SHOWN_TOP_PX = 16
const BOTTOM_TOLERANCE_PX = 1

interface MountFloatingButtonsAutoHideOptions {
  win?: Window
  doc?: Document
}

function isAgeGateOpen(doc: Document) {
  if (doc.documentElement.dataset.ageGateOpen === 'true')
    return true
  return doc.querySelector<HTMLElement>(AGE_GATE_ROOT_SELECTOR)?.dataset.state === 'open'
}

export function mountFloatingButtonsAutoHide({
  win = window,
  doc = document,
}: MountFloatingButtonsAutoHideOptions = {}) {
  const hamburger = doc.querySelector<HTMLElement>(HAMBURGER_SELECTOR)
  const languageRoot = doc.querySelector<HTMLElement>(LANGUAGE_ROOT_SELECTOR)
  const roots = [hamburger, languageRoot].filter((root): root is HTMLElement => root !== null)
  if (roots.length === 0)
    return () => {}

  const languageMenu = languageRoot?.querySelector<HTMLDetailsElement>(LANGUAGE_MENU_SELECTOR) ?? null

  let lastY = win.scrollY
  let travel = 0
  let rafId: number | null = null

  const setHidden = (hidden: boolean) => {
    for (const root of roots)
      root.toggleAttribute(HIDDEN_ATTRIBUTE, hidden)
  }

  const showNow = () => {
    travel = 0
    setHidden(false)
  }

  // Hiding must never strand a keyboard user or cover an open surface.
  const isPinnedVisible = () => {
    if (hamburger?.dataset.mobileHamburgerMounted === 'true' || hamburger?.dataset.mobileHamburgerOpen === 'true')
      return true
    if (languageMenu?.open)
      return true
    const active = doc.activeElement
    // Pointer taps also focus buttons/summaries (Chrome) and scrolling never blurs them, so only
    // keyboard-originated focus may pin; otherwise one toggle tap would disable auto-hide for good.
    if (active && roots.some(root => root.contains(active)) && active.matches(':focus-visible'))
      return true
    return isAgeGateOpen(doc)
  }

  const update = () => {
    rafId = null
    const y = win.scrollY
    const delta = y - lastY
    lastY = y

    const atBottom = y + win.innerHeight >= doc.documentElement.scrollHeight - BOTTOM_TOLERANCE_PX
    if (y <= ALWAYS_SHOWN_TOP_PX || atBottom || isPinnedVisible()) {
      showNow()
      return
    }

    // A repeated scroll event at the same offset must not reset the running travel.
    if (delta === 0)
      return

    // A direction reversal restarts the count so only sustained travel flips the state.
    travel = Math.sign(delta) === Math.sign(travel)
      ? travel + delta
      : delta
    if (travel >= DIRECTION_THRESHOLD_PX) {
      travel = 0
      setHidden(true)
    }
    else if (travel <= -DIRECTION_THRESHOLD_PX) {
      showNow()
    }
  }

  const onScroll = () => {
    if (rafId !== null)
      return
    rafId = win.requestAnimationFrame(update)
  }

  win.addEventListener('scroll', onScroll, { passive: true })
  win.addEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, showNow)
  for (const root of roots)
    root.addEventListener('focusin', showNow)
  languageMenu?.addEventListener('toggle', showNow)

  return () => {
    win.removeEventListener('scroll', onScroll)
    win.removeEventListener(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, showNow)
    for (const root of roots)
      root.removeEventListener('focusin', showNow)
    languageMenu?.removeEventListener('toggle', showNow)
    if (rafId !== null)
      win.cancelAnimationFrame(rafId)
    rafId = null
  }
}
