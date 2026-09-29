export interface CommissionIdentity {
  id: number
  commissionDate: string | null
  creatorName: string | null
}

export function getCommissionDisplayLabel(commission: CommissionIdentity) {
  const date = commission.commissionDate || 'Undated'
  const creator = commission.creatorName?.trim() || 'Unknown creator'
  return `${date} · ${creator} · #${commission.id}`
}

export function compareCommissionsByDate<T extends CommissionIdentity>(left: T, right: T) {
  const dateOrder = (right.commissionDate ?? '').localeCompare(left.commissionDate ?? '')
  if (dateOrder !== 0) {
    return dateOrder
  }

  return right.id - left.id
}
