export type CommissionViewMode = 'character' | 'timeline'

const VIEW_MODE_QUERY_PARAM = 'view'

export function parseCommissionViewModeFromSearch(search: string): CommissionViewMode {
  const view = new URLSearchParams(search).get(VIEW_MODE_QUERY_PARAM)
  return view === 'timeline' ? 'timeline' : 'character'
}
