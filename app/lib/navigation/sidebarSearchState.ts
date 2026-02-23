export const SIDEBAR_SEARCH_STATE_EVENT = 'sidebar-search-state-change'

export type SidebarSearchStateDetail = {
  active: boolean
  visibleSectionIds?: string[]
}

export const dispatchSidebarSearchState = (active: boolean, visibleSectionIds?: string[]) => {
  window.dispatchEvent(
    new CustomEvent<SidebarSearchStateDetail>(SIDEBAR_SEARCH_STATE_EVENT, {
      detail: { active, visibleSectionIds },
    }),
  )
}

export const getSidebarSearchStateDetail = (event: Event): SidebarSearchStateDetail | null => {
  const detail = (event as CustomEvent<SidebarSearchStateDetail>).detail
  if (!detail) return null

  return {
    active: Boolean(detail.active),
    visibleSectionIds: detail.visibleSectionIds,
  }
}
