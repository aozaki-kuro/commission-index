import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { readCommissionViewMode } from '#features/home/commission/viewModeState'
import { scrollToHashTargetFromHrefWithoutHash } from '#lib/navigation/hashAnchor'
import { dispatchSidebarSearchState } from '#lib/navigation/sidebarSearchState'

export const TIMELINE_VIEW_LOADED_EVENT = 'home:timeline-view-loaded'

const TIMELINE_PANEL_SELECTOR = '[data-commission-view-panel="timeline"]'
const TIMELINE_TEMPLATE_SELECTOR = 'template[data-timeline-sections-template="true"]'
const TIMELINE_CONTAINER_SELECTOR = '[data-timeline-sections-container="true"]'

type TimelineViewLoaderDeps = {
  dispatchSidebarSync: typeof dispatchSidebarSearchState
  scrollToHashWithoutWrite: typeof scrollToHashTargetFromHrefWithoutHash
}

type MountTimelineViewLoaderOptions = {
  win?: Window
  doc?: Document
  deps?: Partial<TimelineViewLoaderDeps>
}

const defaultDeps: TimelineViewLoaderDeps = {
  dispatchSidebarSync: dispatchSidebarSearchState,
  scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash,
}

const isTimelineLoaded = (panel: HTMLElement | null) => panel?.dataset.timelineLoaded === 'true'

const mountTemplateContent = (panel: HTMLElement) => {
  const template = panel.querySelector<HTMLTemplateElement>(TIMELINE_TEMPLATE_SELECTOR)
  const container = panel.querySelector<HTMLElement>(TIMELINE_CONTAINER_SELECTOR)
  if (!template || !container) return false

  container.replaceChildren(template.content.cloneNode(true))
  return true
}

const loadTimelineSections = ({
  win,
  panel,
  deps,
}: {
  win: Window
  panel: HTMLElement | null
  deps: TimelineViewLoaderDeps
}) => {
  if (!panel || isTimelineLoaded(panel)) return false
  if (!mountTemplateContent(panel)) return false

  panel.dataset.timelineLoaded = 'true'
  deps.dispatchSidebarSync()
  win.dispatchEvent(new Event(TIMELINE_VIEW_LOADED_EVENT))
  return true
}

export const mountTimelineViewLoader = ({
  win = window,
  doc = document,
  deps: depsOverrides,
}: MountTimelineViewLoaderOptions = {}) => {
  const panel = doc.querySelector<HTMLElement>(TIMELINE_PANEL_SELECTOR)
  if (!panel) return () => {}

  const deps = { ...defaultDeps, ...depsOverrides }

  const syncByMode = () => {
    if (readCommissionViewMode(win) !== 'timeline') return

    const didLoad = loadTimelineSections({ win, panel, deps })
    if (!didLoad || !win.location.hash) return

    win.requestAnimationFrame(() => {
      deps.scrollToHashWithoutWrite(win.location.hash)
    })
  }

  win.addEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncByMode)
  win.addEventListener('popstate', syncByMode)
  syncByMode()

  return () => {
    win.removeEventListener(COMMISSION_VIEW_MODE_CHANGE_EVENT, syncByMode)
    win.removeEventListener('popstate', syncByMode)
  }
}
