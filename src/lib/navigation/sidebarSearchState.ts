export const SIDEBAR_SEARCH_STATE_EVENT = 'sidebar-search-state-change'

export function dispatchSidebarSearchState() {
  window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))
}
