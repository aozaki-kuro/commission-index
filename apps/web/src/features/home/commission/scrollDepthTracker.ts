const ACTIVE_PANEL_SELECTOR = '[data-commission-view-panel][data-commission-view-active="true"]'
// Archived characters are folded by default; counting them would let an expanded archive inflate
// the share of the default list a reader actually got through.
const CHARACTER_ENTRY_SELECTOR = '[data-character-status="active"] [data-commission-entry="true"]'
const TIMELINE_ENTRY_SELECTOR = '[data-commission-entry="true"]'
// Tailwind's `lg`: the breakpoint where the desktop sidebar replaces the hamburger menu.
const DESKTOP_LAYOUT_QUERY = '(min-width: 64rem)'

export const SCROLL_DEPTH_MILESTONES = [25, 50, 75, 100] as const

export interface ScrollDepthEventProperties {
  depth: (typeof SCROLL_DEPTH_MILESTONES)[number]
  view_mode: string
  layout: 'desktop' | 'mobile'
  total_entries: number
}

interface MountScrollDepthTrackerOptions {
  win?: Window
  doc?: Document
  trackEvent: (properties: ScrollDepthEventProperties) => void
}

function hasSearchQuery(win: Window) {
  return (new URLSearchParams(win.location.search).get('q') ?? '').trim() !== ''
}

// Entries are in reading order, so the reached count is the run of entries whose top has entered
// the viewport.
function countReachedEntries(win: Window, entries: NodeListOf<HTMLElement>) {
  let reached = 0
  for (const entry of entries) {
    if (entry.getClientRects().length === 0)
      continue
    if (entry.getBoundingClientRect().top >= win.innerHeight)
      break
    reached += 1
  }
  return reached
}

export function mountScrollDepthTracker({
  win = window,
  doc = document,
  trackEvent,
}: MountScrollDepthTrackerOptions) {
  const reportedByViewMode = new Map<string, Set<number>>()
  let rafId: number | null = null

  const update = () => {
    rafId = null
    // A filtered list has a different denominator; its depth would not be comparable.
    if (hasSearchQuery(win))
      return

    const panel = doc.querySelector<HTMLElement>(ACTIVE_PANEL_SELECTOR)
    const viewMode = panel?.dataset.commissionViewPanel
    const total = Number(panel?.dataset.totalEntries)
    if (!panel || !viewMode || !Number.isInteger(total) || total <= 0)
      return

    const reported = reportedByViewMode.get(viewMode) ?? new Set<number>()
    reportedByViewMode.set(viewMode, reported)
    if (reported.size === SCROLL_DEPTH_MILESTONES.length)
      return

    const selector = viewMode === 'character' ? CHARACTER_ENTRY_SELECTOR : TIMELINE_ENTRY_SELECTOR
    const reachedPercent = (countReachedEntries(win, panel.querySelectorAll<HTMLElement>(selector)) / total) * 100
    const layout = win.matchMedia?.(DESKTOP_LAYOUT_QUERY).matches ? 'desktop' : 'mobile'
    for (const depth of SCROLL_DEPTH_MILESTONES) {
      if (reachedPercent < depth || reported.has(depth))
        continue
      reported.add(depth)
      trackEvent({ depth, view_mode: viewMode, layout, total_entries: total })
    }
  }

  const onScroll = () => {
    if (rafId !== null)
      return
    rafId = win.requestAnimationFrame(update)
  }

  win.addEventListener('scroll', onScroll, { passive: true })

  return () => {
    win.removeEventListener('scroll', onScroll)
    if (rafId !== null)
      win.cancelAnimationFrame(rafId)
    rafId = null
  }
}
