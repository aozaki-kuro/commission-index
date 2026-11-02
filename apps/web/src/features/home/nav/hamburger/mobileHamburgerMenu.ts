import type { ArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
import type { CommissionViewMode } from '@features/home/commission/CommissionViewModeSearch'
import {
  ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
  isArchivedCharactersVisible,
  requestArchivedCharactersVisibility,
} from '@features/home/commission/archivedCharactersState'
import { markScrollJump } from '@features/home/commission/scrollDepthTracker'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '@features/home/commission/viewModeState'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT, HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '@features/home/events'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { trackRybbitEvent } from '@lib/analytics/track'
import { isUnmodifiedPrimaryClick, scrollToHashTargetFromHrefWithoutHash } from '@lib/navigation/hashAnchor'
import { jumpToCommissionSearch } from '@lib/navigation/jumpToCommissionSearch'
import { SIDEBAR_SEARCH_STATE_EVENT } from '@lib/navigation/sidebarSearchState'
import { syncHiddenSectionLinkAvailability } from '@lib/navigation/syncHiddenSectionLinkAvailability'
import { revealArchivedHomeNavTarget } from '../homeNavTargetClient'
import { MENU_TRANSITION_MS } from './constants'

const ROOT_SELECTOR = '[data-mobile-hamburger="true"]'
const TOGGLE_SELECTOR = '[data-mobile-hamburger-toggle="true"]'
const TOGGLE_LABEL_SELECTOR = '[data-mobile-hamburger-toggle-label]'
const TOGGLE_ICON_SELECTOR = '[data-mobile-hamburger-toggle-icon="true"]'
const MENU_ICON_SELECTOR = '[data-mobile-hamburger-icon-menu="true"]'
const CLOSE_ICON_SELECTOR = '[data-mobile-hamburger-icon-close="true"]'
const BACKDROP_SELECTOR = '[data-mobile-hamburger-backdrop="true"]'
const PANEL_SELECTOR = '[data-mobile-hamburger-panel="true"]'
const SEARCH_ACTION_SELECTOR = '[data-mobile-hamburger-search-action="true"]'
const VIEW_MODE_TOGGLE_SELECTOR = '[data-mobile-hamburger-view-mode-toggle="true"]'
const NAV_PANEL_SELECTOR = '[data-mobile-hamburger-nav-panel]'
const NAV_ROOT_SELECTOR = '[data-mobile-nav-root="true"]'
const NAV_LINK_SELECTOR = '[data-mobile-nav-link="true"]'
const CHARACTER_SECTION_SELECTOR = '[data-mobile-character-section]'
const CHARACTER_SECTION_TOGGLE_SELECTOR = '[data-mobile-character-section-toggle="true"]'
const AGE_GATE_ROOT_SELECTOR = '[data-age-gate-root]'
const AGE_GATE_STATE_EVENT = 'age-gate-state-change'
// apple.com's menu curve. Only transform/opacity animate: WebKit cannot hand a height or grid-row transition to Core
// Animation, so on iPhone it laid out and repainted the full-screen panel on the main thread every frame.
const SECTION_SLIDE_MS = 320
const SECTION_FADE_MS = 240
const SECTION_EASING = 'cubic-bezier(0.4, 0, 0.6, 1)'

interface MobileHamburgerMenuDeps {
  trackEvent: typeof trackRybbitEvent
  jumpToSearch: typeof jumpToCommissionSearch
  syncLinkAvailability: typeof syncHiddenSectionLinkAvailability
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
  requestArchivedVisibility: (win: Window, visibility: ArchivedCharactersVisibility) => void
}

interface MountMobileHamburgerMenuOptions {
  win?: Window
  doc?: Document
  deps?: Partial<MobileHamburgerMenuDeps>
}

type CharacterSectionKey = 'active' | 'archived'
interface CharacterSectionNode {
  key: CharacterSectionKey
  root: HTMLElement
  trigger: HTMLButtonElement | null
  panel: HTMLElement | null
  chevron: HTMLElement | null
}

const defaultDeps: MobileHamburgerMenuDeps = {
  trackEvent: trackRybbitEvent,
  jumpToSearch: jumpToCommissionSearch,
  syncLinkAvailability: syncHiddenSectionLinkAvailability,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
  requestArchivedVisibility: requestArchivedCharactersVisibility,
}

function resolveCharacterSectionKeyFromElement(target: Element | null): CharacterSectionKey | null {
  if (!target)
    return null
  const key = target.getAttribute('data-mobile-character-section-key')
  if (key === 'active' || key === 'archived')
    return key
  return null
}

function resolveCharacterSectionKeyFromValue(value: string | undefined): CharacterSectionKey | null {
  if (value === 'active' || value === 'archived')
    return value
  return null
}

function resolveViewModeFromPanel(panel: HTMLElement): CommissionViewMode | null {
  const mode = panel.dataset.mobileHamburgerNavPanel
  if (mode === 'character' || mode === 'timeline')
    return mode
  return null
}

function readAgeGateOpen(doc: Document) {
  if (doc.documentElement.dataset.ageGateOpen === 'true')
    return true
  return doc.querySelector<HTMLElement>(AGE_GATE_ROOT_SELECTOR)?.dataset.state === 'open'
}

function setHtmlScrollLocked(doc: Document, locked: boolean) {
  const html = doc.documentElement
  html.classList.toggle('overflow-hidden', locked)
  html.classList.toggle('touch-none', locked)
}

function syncViewModeIndicatorState(button: HTMLButtonElement, active: boolean) {
  button.setAttribute('aria-pressed', String(active))
  button.classList.toggle('text-gray-900', active)
  button.classList.toggle('dark:text-white', active)
  button.classList.toggle('text-gray-800', !active)
  button.classList.toggle('dark:text-gray-100', !active)

  const indicator = button.querySelector<HTMLElement>('[data-mobile-hamburger-view-mode-indicator]')
  if (!indicator)
    return

  indicator.classList.toggle('scale-100', active)
  indicator.classList.toggle('opacity-100', active)
  indicator.classList.toggle('scale-95', !active)
  indicator.classList.toggle('opacity-0', !active)
}

export function mountMobileHamburgerMenu({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountMobileHamburgerMenuOptions = {}) {
  const deps = {
    ...defaultDeps,
    ...depsOverrides,
  }
  const root = doc.querySelector<HTMLElement>(ROOT_SELECTOR)
  const toggle = root?.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR) ?? null
  const toggleLabel = root?.querySelector<HTMLElement>(TOGGLE_LABEL_SELECTOR) ?? null
  const toggleIcon = root?.querySelector<HTMLElement>(TOGGLE_ICON_SELECTOR) ?? null
  const menuIcon = root?.querySelector<HTMLElement>(MENU_ICON_SELECTOR) ?? null
  const closeIcon = root?.querySelector<HTMLElement>(CLOSE_ICON_SELECTOR) ?? null
  const backdrop = root?.querySelector<HTMLButtonElement>(BACKDROP_SELECTOR) ?? null
  const panel = root?.querySelector<HTMLElement>(PANEL_SELECTOR) ?? null
  const navRoot = root?.querySelector<HTMLElement>(NAV_ROOT_SELECTOR) ?? null
  const searchAction = root?.querySelector<HTMLButtonElement>(SEARCH_ACTION_SELECTOR) ?? null
  if (!root || !toggle || !toggleLabel || !backdrop || !panel || !navRoot || !searchAction)
    return () => {}

  const viewModeToggles = [
    ...root.querySelectorAll<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR),
  ]
  const navPanels = [
    ...root.querySelectorAll<HTMLElement>(NAV_PANEL_SELECTOR),
  ]
  const navPanelByMode = new Map<CommissionViewMode, HTMLElement>()
  navPanels.forEach((panelNode) => {
    const mode = resolveViewModeFromPanel(panelNode)
    if (!mode)
      return
    navPanelByMode.set(mode, panelNode)
  })
  const characterSections: CharacterSectionNode[] = Array.from(root.querySelectorAll<HTMLElement>(CHARACTER_SECTION_SELECTOR), (section) => {
    const key = resolveCharacterSectionKeyFromValue(section.dataset.mobileCharacterSection)
    if (!key)
      return null
    return {
      key,
      root: section,
      trigger: section.querySelector<HTMLButtonElement>(CHARACTER_SECTION_TOGGLE_SELECTOR),
      panel: section.querySelector<HTMLElement>(`[data-mobile-character-section-panel="${key}"]`),
      chevron: section.querySelector<HTMLElement>(
        '[data-mobile-character-section-chevron="true"]',
      ),
    }
  })
    .filter((section): section is CharacterSectionNode => Boolean(section))
  // What sits below the first section slides while a list opens or shuts. The language row is a staggered
  // [data-mobile-hamburger-row] with its own CSS transform transition, which cancelling a WAAPI transform could
  // restart, so its children move instead.
  const sectionFollowers: HTMLElement[] = characterSections.slice(1).map(section => section.root)
  for (let sibling = navRoot.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    sectionFollowers.push(...sibling.querySelectorAll<HTMLElement>(':scope > *'))
  }

  const openNavigationLabel = root.dataset.mobileHamburgerOpenLabel ?? 'Open navigation menu'
  const closeNavigationLabel = root.dataset.mobileHamburgerCloseLabel ?? 'Close navigation menu'

  let open = false
  let mounted = false
  let disposed = false
  let closeTimerId: number | null = null
  let openRafId: number | null = null
  let hasTrackedSearchUsage = false
  let didHandleSearchPointerDown = false
  let expandedCharacterSection: CharacterSectionKey | null = 'active'
  let settleCharacterSectionSlide: (() => void) | null = null
  let ageGateOpen = readAgeGateOpen(doc)

  const clearCloseTimer = () => {
    if (closeTimerId === null)
      return
    win.clearTimeout(closeTimerId)
    closeTimerId = null
  }

  const clearOpenRaf = () => {
    if (openRafId === null)
      return
    win.cancelAnimationFrame(openRafId)
    openRafId = null
  }

  const dispatchMountedChange = (nextMounted: boolean) => {
    win.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, {
        detail: { mounted: nextMounted },
      }),
    )
  }

  const syncOpenState = () => {
    const isVisible = mounted

    root.classList.toggle('invisible', ageGateOpen)
    root.classList.toggle('opacity-0', ageGateOpen)
    root.classList.toggle('pointer-events-none', ageGateOpen)
    root.classList.toggle('opacity-100', !ageGateOpen)
    toggle.disabled = ageGateOpen
    toggle.setAttribute('aria-hidden', String(ageGateOpen))

    root.dataset.mobileHamburgerMounted = isVisible ? 'true' : 'false'
    root.dataset.mobileHamburgerOpen = open ? 'true' : 'false'
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? closeNavigationLabel : openNavigationLabel)
    toggleLabel.textContent = open ? closeNavigationLabel : openNavigationLabel
    panel.setAttribute('aria-hidden', String(!open))

    backdrop.classList.toggle('hidden', !isVisible)
    panel.classList.toggle('hidden', !isVisible)

    backdrop.classList.toggle('pointer-events-auto', open)
    backdrop.classList.toggle('opacity-100', open)
    backdrop.classList.toggle('pointer-events-none', !open)
    backdrop.classList.toggle('opacity-0', !open)

    panel.classList.toggle('pointer-events-auto', open)
    panel.classList.toggle('translate-y-0', open)
    panel.classList.toggle('opacity-100', open)
    panel.classList.toggle('pointer-events-none', !open)
    panel.classList.toggle('opacity-0', !open)

    if (toggleIcon) {
      toggleIcon.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)'
    }
    menuIcon?.classList.toggle('hidden', open)
    closeIcon?.classList.toggle('hidden', !open)

    setHtmlScrollLocked(doc, open)
  }

  const setMounted = (nextMounted: boolean) => {
    if (mounted === nextMounted)
      return
    mounted = nextMounted
    syncOpenState()
    dispatchMountedChange(nextMounted)
  }

  const closeMenu = () => {
    clearOpenRaf()
    open = false
    syncOpenState()
    clearCloseTimer()
    closeTimerId = win.setTimeout(() => {
      closeTimerId = null
      setMounted(false)
    }, MENU_TRANSITION_MS)
  }

  const openMenu = () => {
    if (ageGateOpen)
      return

    clearCloseTimer()
    clearOpenRaf()
    setMounted(true)
    openRafId = win.requestAnimationFrame(() => {
      open = true
      syncOpenState()
      openRafId = null
    })
  }

  const toggleMenu = () => {
    if (ageGateOpen)
      return

    if (open) {
      closeMenu()
      return
    }
    openMenu()
  }

  const syncCharacterSectionState = () => {
    characterSections.forEach((section) => {
      const expanded = section.key === expandedCharacterSection
      section.trigger?.setAttribute('aria-expanded', String(expanded))
      section.panel?.toggleAttribute('data-collapsed', !expanded)
      section.chevron?.classList.toggle('rotate-180', expanded)
    })
  }

  // FLIP: measure, snap the layout, then slide everything back from where it was. A shutting list stays laid out
  // until its slide ends, so its data-collapsed lands at the end of the close.
  const slideCharacterSectionChange = (previous: CharacterSectionKey | null) => {
    settleCharacterSectionSlide?.()
    if (typeof panel.animate !== 'function' || win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      syncCharacterSectionState()
      return
    }

    // Tops are in scroll-content coordinates: the snapped layout can be too short for the current scroll position.
    const readTops = () => sectionFollowers.map(node => node.getBoundingClientRect().top + panel.scrollTop)
    const scrollTop = panel.scrollTop
    const firstTops = readTops()
    syncCharacterSectionState()
    const lastTops = readTops()
    const settledScrollTop = panel.scrollTop
    const closing = characterSections.filter(section => section.key === previous)
    closing.forEach(section => section.panel?.removeAttribute('data-collapsed'))
    panel.scrollTop = scrollTop
    const slideTops = readTops()
    // The browser clamps the scroll position when a shorter layout settles; carrying the whole panel down by that much
    // during the slide makes the clamp land invisibly. Rows keep their own CSS transform, so they are not carriers.
    const scrollShift = scrollTop - settledScrollTop
    const scrollCarriers = scrollShift > 0
      ? [...panel.children].filter((node): node is HTMLElement =>
          node instanceof HTMLElement && !node.hasAttribute('data-mobile-hamburger-row'))
      : []

    const slide: KeyframeAnimationOptions = { duration: SECTION_SLIDE_MS, easing: SECTION_EASING, fill: 'forwards' }
    const fade: KeyframeAnimationOptions = { duration: SECTION_FADE_MS, easing: SECTION_EASING, fill: 'forwards' }
    const animations: Animation[] = scrollCarriers.map(node => node.animate([
      { transform: 'none' },
      { transform: `translateY(${scrollShift}px)` },
    ], slide))
    sectionFollowers.forEach((node, index) => {
      const carried = scrollCarriers.some(carrier => carrier.contains(node))
      const from = firstTops[index] - slideTops[index]
      const to = lastTops[index] - slideTops[index] + (carried ? 0 : scrollShift)
      if (from === 0 && to === 0)
        return
      animations.push(node.animate([
        { transform: `translateY(${from}px)` },
        { transform: `translateY(${to}px)` },
      ], slide))
    })

    characterSections.forEach((section) => {
      const opening = section.key === expandedCharacterSection
      if (!opening && section.key !== previous)
        return
      const clip = section.panel?.firstElementChild
      const content = clip?.firstElementChild
      if (!section.panel || !(clip instanceof HTMLElement) || !(content instanceof HTMLElement))
        return
      // The clip box moves while the content counter-moves and holds still, so the list is revealed like a growing
      // height without laying anything out.
      const height = clip.getBoundingClientRect().height
      const clipFrames = [
        { transform: `translateY(${-height}px)` },
        { transform: 'none' },
      ]
      const contentFrames = [
        { transform: `translateY(${height}px)` },
        { transform: 'none' },
      ]
      const fadeFrames = [
        { opacity: 0 },
        { opacity: 1 },
      ]
      if (!opening) {
        clipFrames.reverse()
        contentFrames.reverse()
        fadeFrames.reverse()
      }
      animations.push(
        clip.animate(clipFrames, slide),
        content.animate(contentFrames, slide),
        section.panel.animate(fadeFrames, fade),
      )
    })

    const settle = () => {
      if (settleCharacterSectionSlide !== settle)
        return
      settleCharacterSectionSlide = null
      closing.forEach(section => section.panel?.setAttribute('data-collapsed', ''))
      animations.forEach(animation => animation.cancel())
    }
    settleCharacterSectionSlide = settle
    // The finished promises resolve before the frame renders, so the collapse and the cancel paint together.
    void Promise.all(animations.map(animation => animation.finished)).then(settle, () => {})
  }

  const syncViewModeState = () => {
    const mode = readCommissionViewMode(win)
    viewModeToggles.forEach((button) => {
      const buttonMode = resolveCommissionViewModeFromElement(button)
      syncViewModeIndicatorState(button, buttonMode === mode)
    })

    navPanels.forEach((currentPanel) => {
      currentPanel.classList.toggle('hidden', currentPanel.dataset.mobileHamburgerNavPanel !== mode)
    })
  }

  const resolveLinkAvailabilityRoot = (): ParentNode => {
    const mode = readCommissionViewMode(win)
    const currentPanel = navPanelByMode.get(mode)
    if (!currentPanel)
      return navRoot

    return currentPanel.querySelector(NAV_LINK_SELECTOR)
      ? currentPanel
      : navRoot
  }

  const syncLinkAvailability = () => {
    deps.syncLinkAvailability({
      root: resolveLinkAvailabilityRoot(),
      linkSelector: NAV_LINK_SELECTOR,
      getSectionId: link => link.dataset.mobileNavSectionId ?? null,
    })
  }

  const syncUiState = () => {
    settleCharacterSectionSlide?.()
    syncViewModeState()
    syncCharacterSectionState()
    syncLinkAvailability()
  }

  const trackCharacterNavClick = () => {
    markScrollJump(win)
    deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
      source: 'character_link',
      layout: 'mobile',
      view_mode: readCommissionViewMode(win),
    })
  }

  const runSearchAction = () => {
    if (!hasTrackedSearchUsage) {
      hasTrackedSearchUsage = true
      deps.trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
        source: 'search_link',
        layout: 'mobile',
        view_mode: readCommissionViewMode(win),
      })
    }

    setHtmlScrollLocked(doc, false)
    deps.jumpToSearch({ topGap: 40, focusMode: 'immediate' })
    closeMenu()
  }

  const onRootPointerDown = (event: PointerEvent) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const actionButton = target.closest<HTMLButtonElement>(SEARCH_ACTION_SELECTOR)
    if (!actionButton)
      return

    event.preventDefault()
    didHandleSearchPointerDown = true
    runSearchAction()
  }

  const onRootClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const clickedToggle = target.closest<HTMLButtonElement>(TOGGLE_SELECTOR)
    if (clickedToggle) {
      toggleMenu()
      return
    }

    const viewModeToggle = target.closest<HTMLButtonElement>(VIEW_MODE_TOGGLE_SELECTOR)
    if (viewModeToggle) {
      const currentMode = readCommissionViewMode(win)
      const nextMode = resolveCommissionViewModeFromElement(viewModeToggle)
      if (!nextMode)
        return

      if (currentMode !== nextMode) {
        replaceCommissionViewModeInAddress(win, nextMode)
      }
      else {
        syncUiState()
      }
      return
    }

    const characterSectionToggle = target.closest<HTMLButtonElement>(
      CHARACTER_SECTION_TOGGLE_SELECTOR,
    )
    if (characterSectionToggle) {
      const sectionKey = resolveCharacterSectionKeyFromElement(characterSectionToggle)
      if (!sectionKey)
        return
      const previousSection = expandedCharacterSection
      expandedCharacterSection = expandedCharacterSection === sectionKey
        ? null
        : sectionKey
      slideCharacterSectionChange(previousSection)
      if (expandedCharacterSection === 'archived' && !isArchivedCharactersVisible(doc)) {
        deps.requestArchivedVisibility(win, 'visible')
      }
      return
    }

    const searchButton = target.closest<HTMLButtonElement>(SEARCH_ACTION_SELECTOR)
    if (searchButton) {
      if (didHandleSearchPointerDown) {
        didHandleSearchPointerDown = false
        return
      }
      runSearchAction()
      return
    }

    const navLink = target.closest<HTMLAnchorElement>(NAV_LINK_SELECTOR)
    if (!navLink || !isUnmodifiedPrimaryClick(event))
      return

    const mode = readCommissionViewMode(win)
    const href = navLink.getAttribute('href')
    const isArchivedLink = navLink.dataset.mobileNavCharacterStatus === 'archived'
    if (isArchivedLink && !isArchivedCharactersVisible(doc)) {
      event.preventDefault()
      revealArchivedHomeNavTarget({
        onVisible: () => {
          deps.scrollToHashWithoutWrite(href)
          syncLinkAvailability()
        },
        requestArchivedVisibility: deps.requestArchivedVisibility,
        win,
      })
      trackCharacterNavClick()
      closeMenu()
      return
    }
    if (navLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      return
    }

    if (mode === 'timeline') {
      event.preventDefault()
      deps.scrollToHashWithoutWrite(navLink.getAttribute('href'))
    }

    trackCharacterNavClick()
    closeMenu()
  }

  const onBackdropClick = () => {
    closeMenu()
  }

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape')
      return
    closeMenu()
  }

  const onViewModeChanged = () => {
    syncUiState()
  }

  const onLinkAvailabilityRelatedStateChanged = () => {
    syncLinkAvailability()
  }

  const onPopState = () => {
    syncUiState()
  }

  const onAgeGateStateChanged = (event: Event) => {
    const nextOpen
      = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? Boolean((event.detail as { open?: unknown }).open)
        : readAgeGateOpen(doc)
    if (ageGateOpen === nextOpen)
      return

    ageGateOpen = nextOpen
    if (ageGateOpen) {
      clearCloseTimer()
      clearOpenRaf()
      open = false
      setMounted(false)
      setHtmlScrollLocked(doc, false)
      syncOpenState()
    }
    else {
      syncOpenState()
    }
  }

  root.addEventListener('pointerdown', onRootPointerDown)
  root.addEventListener('click', onRootClick)
  backdrop.addEventListener('click', onBackdropClick)
  doc.addEventListener('keydown', onDocumentKeyDown)
  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeChanged)
  win.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onLinkAvailabilityRelatedStateChanged)
  win.addEventListener(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, onLinkAvailabilityRelatedStateChanged)
  win.addEventListener('popstate', onPopState)
  win.addEventListener(AGE_GATE_STATE_EVENT, onAgeGateStateChanged)

  syncUiState()
  syncOpenState()

  return () => {
    if (disposed)
      return
    disposed = true

    clearCloseTimer()
    clearOpenRaf()
    settleCharacterSectionSlide?.()
    setHtmlScrollLocked(doc, false)
    if (mounted) {
      mounted = false
      dispatchMountedChange(false)
    }

    root.removeEventListener('pointerdown', onRootPointerDown)
    root.removeEventListener('click', onRootClick)
    backdrop.removeEventListener('click', onBackdropClick)
    doc.removeEventListener('keydown', onDocumentKeyDown)
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, onViewModeChanged)
    win.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onLinkAvailabilityRelatedStateChanged)
    win.removeEventListener(
      ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT,
      onLinkAvailabilityRelatedStateChanged,
    )
    win.removeEventListener('popstate', onPopState)
    win.removeEventListener(AGE_GATE_STATE_EVENT, onAgeGateStateChanged)
  }
}
