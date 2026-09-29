export interface CommissionIdentity {
  id: number
  publicId: string
  commissionDate: string | null
  creatorName: string | null
}

export function formatCommissionPublicId(publicId: string) {
  return publicId.replaceAll('-', '').slice(0, 7)
}

export function getCommissionTitle(commission: CommissionIdentity) {
  const date = commission.commissionDate || 'Undated'
  const creator = commission.creatorName?.trim() || 'Anon'
  return `${date} · ${creator}`
}

export function getCommissionDisplayLabel(commission: CommissionIdentity) {
  const shortPublicId = formatCommissionPublicId(commission.publicId)
  return `${getCommissionTitle(commission)} · #${shortPublicId}`
}

export function getCommissionAccessibleLabel(commission: CommissionIdentity) {
  return `${getCommissionDisplayLabel(commission)} · Public ID ${commission.publicId}`
}

export function compareCommissionsByDate<T extends CommissionIdentity>(left: T, right: T) {
  const dateOrder = (right.commissionDate ?? '').localeCompare(left.commissionDate ?? '')
  if (dateOrder !== 0) {
    return dateOrder
  }

  return right.id - left.id
}
