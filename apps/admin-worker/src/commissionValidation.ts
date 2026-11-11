import { isFutureCommissionDate, isUuidV4 } from '../../../packages/domain/src/index'

// The API applies these rules to answer 400 in field order; persistence applies them again so a direct call cannot
// store an invalid commission. Each returns the first broken rule's message, or null.

export function validateCommissionDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Commission date must use YYYY-MM-DD format.'
  }
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return 'Commission date must be a real calendar date.'
  }
  if (isFutureCommissionDate(date, new Date())) {
    return 'Commission date cannot be in the future.'
  }

  return null
}

// `workGroupId` is lowercased by the caller; `new` passes because persistence swaps it for a fresh UUID afterwards.
export function validateCommissionWorkGroup(workGroupId: string | null, partNumber: number | null): string | null {
  if ((workGroupId === null) !== (partNumber === null)) {
    return 'Work group and part number must be set together.'
  }
  if (workGroupId && workGroupId !== 'new' && !isUuidV4(workGroupId)) {
    return 'Work group must be a lowercase UUID v4.'
  }
  if (partNumber !== null && (!Number.isSafeInteger(partNumber) || partNumber <= 0)) {
    return 'Part number must be a positive integer.'
  }

  return null
}
