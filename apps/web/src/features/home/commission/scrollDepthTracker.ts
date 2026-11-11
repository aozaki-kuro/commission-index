const ACTIVE_PANEL_SELECTOR = '[data-commission-view-panel][data-commission-view-active="true"]'
// Archived characters are folded by default; counting them would let an expanded archive inflate
// the share of the default list a reader actually got through.
const CHARACTER_ENTRY_SELECTOR = '[data-character-status="active"] [data-commission-entry="true"]'
const TIMELINE_ENTRY_SELECTOR = '[data-commission-entry="true"]'
// Search filtering hides entries with the `hidden` class; nothing else does.
const FILTERED_ENTRY_SELECTOR = '[data-commission-entry="true"].hidden'
// Tailwind's `lg`: the breakpoint where the desktop sidebar replaces the hamburger menu.
const DESKTOP_LAYOUT_QUERY = '(min-width: 64rem)'

// 5/10 split the first quarter, where most sessions stop, into "barely scrolled" and "left early".
export const SCROLL_DEPTH_MILESTONES = [5, 10, 25, 50, 75, 100] as const

// Nav links and deep links move the reader without scrolling past the entries in between.
const SCROLL_JUMP_EVENT = 'commission:scroll-jump'

export function markScrollJump(win: Window = window) {
  win.dispatchEvent(new Event(SCROLL_JUMP_EVENT))
}

export interface ScrollDepthEventProperties {
  depth: (typeof SCROLL_DEPTH_MILESTONES)[number]
  view_mode: string
  layout: 'desktop' | 'mobile'
  // Sticky per mount: once a jump happened, later milestones no longer prove the reader scrolled there.
  reached_by: 'scroll' | 'jump'
}

interface MountScrollDepthTrackerOptions {
  win?: Window
  doc?: Document
  trackEvent: (properties: ScrollDepthEventProperties) => void
}

function hasSearchQuery(win: Window) {
  return (new URLSearchParams(win.location.search).get('q') ?? '').trim() !== ''
}

// An entry counts as reached once its top has entered the viewport, including when it has since scrolled above it.
// The root is extended far upward so "intersecting" means exactly that: a jump (nav link, deep link, scroll restore)
// past a milestone still crosses into the extended root, while a viewport-sized root would never see it.
const REACHED_ROOT_MARGIN = '1000000px 0px 0px 0px'

interface MilestoneTarget {
  viewMode: string
  depths: ScrollDepthEventProperties['depth'][]
}

// Entries are in reading order, so reaching N% is the k-th rendered entry's top entering the viewport,
// k = ceil(total x N / 100). A milestone past the rendered entries is never reached.
function collectMilestoneTargets(doc: Document) {
  const targets = new Map<HTMLElement, MilestoneTarget>()
  for (const panel of doc.querySelectorAll<HTMLElement>('[data-commission-view-panel]')) {
    const viewMode = panel.dataset.commissionViewPanel
    const total = Number(panel.dataset.totalEntries)
    if (!viewMode || !Number.isInteger(total) || total <= 0)
      continue
    const selector = viewMode === 'character'
      ? CHARACTER_ENTRY_SELECTOR
      : TIMELINE_ENTRY_SELECTOR
    const entries = [
      ...panel.querySelectorAll<HTMLElement>(selector),
    ]
    for (const depth of SCROLL_DEPTH_MILESTONES) {
      const entry = entries[Math.ceil((total * depth) / 100) - 1]
      if (!entry)
        continue
      const target = targets.get(entry) ?? { viewMode, depths: [] }
      target.depths.push(depth)
      targets.set(entry, target)
    }
  }
  return targets
}

export function mountScrollDepthTracker({
  win = window,
  doc = document,
  trackEvent,
}: MountScrollDepthTrackerOptions) {
  if (typeof IntersectionObserver !== 'function')
    return () => {}

  const reportedByViewMode = new Map<string, Set<number>>()
  // Latest intersection per target, so a milestone reached before the first scroll or under a `?q=` filter is
  // reported once those conditions clear, on the next observer callback.
  const reachedTargets = new Set<HTMLElement>()
  let jumped = win.location.hash !== ''
  // Nothing is reported before the reader scrolls: the observer's initial callback would otherwise count the
  // first screen as reached depth.
  let hasScrolled = false

  // Both panels' targets are observed up front: the view toggle flips `data-commission-view-active` only after its
  // fade-out, and a `display: none` panel's targets simply never intersect.
  const targets = collectMilestoneTargets(doc)

  const observer = new IntersectionObserver((records) => {
    for (const record of records) {
      const element = record.target as HTMLElement
      if (record.isIntersecting)
        reachedTargets.add(element)
      else reachedTargets.delete(element)
    }
    report()
  }, { rootMargin: REACHED_ROOT_MARGIN })
  for (const element of targets.keys())
    observer.observe(element)

  function report() {
    // A filtered list has a different denominator; its depth would not be comparable.
    if (!hasScrolled || hasSearchQuery(win))
      return
    const panel = doc.querySelector<HTMLElement>(ACTIVE_PANEL_SELECTOR)
    const viewMode = panel?.dataset.commissionViewPanel
    // Search hides entries ~300 ms before it writes `?q=`; a relayout in that window must not count as depth.
    if (!panel || !viewMode || panel.querySelector(FILTERED_ENTRY_SELECTOR))
      return
    const reported = reportedByViewMode.get(viewMode) ?? new Set<number>()
    reportedByViewMode.set(viewMode, reported)

    const reachedDepths = new Set<number>()
    for (const element of reachedTargets) {
      const target = targets.get(element)
      if (target?.viewMode !== viewMode)
        continue
      for (const depth of target.depths)
        reachedDepths.add(depth)
    }

    const layout = win.matchMedia?.(DESKTOP_LAYOUT_QUERY).matches
      ? 'desktop'
      : 'mobile'
    for (const depth of SCROLL_DEPTH_MILESTONES) {
      if (!reachedDepths.has(depth) || reported.has(depth))
        continue
      reported.add(depth)
      trackEvent({
        depth,
        view_mode: viewMode,
        layout,
        reached_by: jumped
          ? 'jump'
          : 'scroll',
      })
    }

    // A target whose milestones are all reported has nothing left to say.
    for (const [element, target] of targets) {
      if (target.viewMode === viewMode && target.depths.every(depth => reported.has(depth))) {
        observer.unobserve(element)
        targets.delete(element)
        reachedTargets.delete(element)
      }
    }
  }

  const onFirstScroll = () => {
    hasScrolled = true
    win.removeEventListener('scroll', onFirstScroll)
    report()
  }

  const onJump = () => {
    jumped = true
  }

  win.addEventListener('scroll', onFirstScroll, { passive: true })
  win.addEventListener(SCROLL_JUMP_EVENT, onJump)

  return () => {
    observer.disconnect()
    win.removeEventListener('scroll', onFirstScroll)
    win.removeEventListener(SCROLL_JUMP_EVENT, onJump)
  }
}
