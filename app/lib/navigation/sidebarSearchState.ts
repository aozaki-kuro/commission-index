export const SIDEBAR_SEARCH_STATE_EVENT = 'sidebar-search-state-change'

export const dispatchSidebarSearchState = () => {
  window.dispatchEvent(new Event(SIDEBAR_SEARCH_STATE_EVENT))
}
