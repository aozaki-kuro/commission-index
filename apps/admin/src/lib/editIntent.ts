// A one-shot request to open a commission in the edit drawer, set by a page that then navigates to /edit.
// Kept in memory rather than in the URL: admin routes are bare pathnames, and a reload should not reopen it.
interface EditIntent {
  commissionId: number
  characterId: number
}

let pending: EditIntent | null = null

export function requestCommissionEdit(intent: EditIntent) {
  pending = intent
}

export function consumeCommissionEditRequest() {
  const intent = pending
  pending = null
  return intent
}
