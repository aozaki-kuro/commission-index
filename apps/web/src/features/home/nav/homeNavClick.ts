import type { ArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
import type { trackRybbitEvent } from '@lib/analytics/track'
import type { scrollToHashTargetFromHrefWithoutHash } from '@lib/navigation/hashAnchor'
import { isArchivedCharactersVisible } from '@features/home/commission/archivedCharactersState'
import { markScrollJump } from '@features/home/commission/scrollDepthTracker'
import {
  readCommissionViewMode,
  replaceCommissionViewModeInAddress,
  resolveCommissionViewModeFromElement,
} from '@features/home/commission/viewModeState'
import { ANALYTICS_EVENTS } from '@lib/analytics/events'
import { revealArchivedHomeNavTarget } from './homeNavTargetClient'

// Shared by the desktop sidebar and the mobile hamburger; each call site keeps its own follow-up (the sidebar clears
// the hash a frame later, the hamburger closes the menu).

type HomeNavLayout = 'desktop' | 'mobile'

export function trackHomeNavUsed(
  win: Window,
  trackEvent: typeof trackRybbitEvent,
  source: 'character_link' | 'search_link',
  layout: HomeNavLayout,
) {
  trackEvent(ANALYTICS_EVENTS.sidebarNavUsed, {
    source,
    layout,
    view_mode: readCommissionViewMode(win),
  })
}

/** A view-mode toggle writes the new mode to the address; a click on the current mode only resyncs the controls. */
export function handleViewModeToggleClick(win: Window, button: Element, onSameMode: () => void) {
  const nextMode = resolveCommissionViewModeFromElement(button)
  if (!nextMode)
    return

  if (nextMode !== readCommissionViewMode(win))
    replaceCommissionViewModeInAddress(win, nextMode)
  else
    onSameMode()
}

interface HomeNavCharacterLinkClickOptions {
  event: MouseEvent
  link: HTMLAnchorElement
  isArchivedLink: boolean
  layout: HomeNavLayout
  win: Window
  doc: Document
  deps: {
    trackEvent: typeof trackRybbitEvent
    scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
    requestArchivedVisibility: (win: Window, visibility: ArchivedCharactersVisibility) => void
  }
  /** Runs after the revealed archived target has been scrolled to. */
  onArchivedVisible: () => void
}

/**
 * Character link click (already filtered to unmodified primary clicks). An archived link while archived is collapsed
 * reveals it and then scrolls without writing the hash; a disabled link does nothing; in the timeline view the link is
 * intercepted and scrolled to, otherwise the browser follows the hash.
 */
export function handleHomeNavCharacterLinkClick({
  event,
  link,
  isArchivedLink,
  layout,
  win,
  doc,
  deps,
  onArchivedVisible,
}: HomeNavCharacterLinkClickOptions): 'revealed' | 'disabled' | 'navigated' {
  const href = link.getAttribute('href')
  const trackJump = () => {
    markScrollJump(win)
    trackHomeNavUsed(win, deps.trackEvent, 'character_link', layout)
  }

  if (isArchivedLink && !isArchivedCharactersVisible(doc)) {
    event.preventDefault()
    revealArchivedHomeNavTarget({
      onVisible: () => {
        deps.scrollToHashWithoutWrite(href)
        onArchivedVisible()
      },
      requestArchivedVisibility: deps.requestArchivedVisibility,
      win,
    })
    trackJump()
    return 'revealed'
  }

  if (link.getAttribute('aria-disabled') === 'true') {
    event.preventDefault()
    return 'disabled'
  }

  if (readCommissionViewMode(win) === 'timeline') {
    event.preventDefault()
    deps.scrollToHashWithoutWrite(href)
  }

  trackJump()
  return 'navigated'
}
