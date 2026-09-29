export interface CommissionFileDetails {
  commissionDate: string
  creatorName: string
  workGroupId: string
  partNumber: number | null
}

export function extractCommissionDetails(fileName: string): CommissionFileDetails | null {
  const stem = fileName.trim().replace(/\.[^.]+$/, '')
  const match = stem.match(/^(\d{8})(?:_(.*))?$/)
  if (!match) {
    return null
  }

  const compactDate = match[1]
  const commissionDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
  const parsedDate = new Date(`${commissionDate}T00:00:00Z`)
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== commissionDate) {
    return null
  }

  const creatorName = match[2]?.trim() ?? ''
  const suffix = creatorName.match(/\s+\(part ([1-9]\d*)\)$/i)
  const partNumber = suffix ? Number(suffix[1]) : null
  const hasValidPartNumber = partNumber !== null && Number.isSafeInteger(partNumber)

  return {
    commissionDate,
    creatorName: hasValidPartNumber ? creatorName.slice(0, -suffix![0].length).trim() : creatorName,
    workGroupId: hasValidPartNumber ? 'new' : '',
    partNumber: hasValidPartNumber ? partNumber : null,
  }
}
