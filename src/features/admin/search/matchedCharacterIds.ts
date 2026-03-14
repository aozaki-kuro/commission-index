import type { AdminCommissionSearchRow } from '#lib/admin/db'

export function buildCommissionToCharacterMap(rows: AdminCommissionSearchRow[]) {
  const next = new Map<number, number>()
  for (const row of rows) {
    next.set(row.id, row.characterId)
  }
  return next
}

export function collectMatchedCharacterIds(matchedCommissionIds: ReadonlySet<number>, commissionToCharacterIdMap: ReadonlyMap<number, number>) {
  const next = new Set<number>()
  for (const commissionId of matchedCommissionIds) {
    const characterId = commissionToCharacterIdMap.get(commissionId)
    if (characterId === undefined)
      continue
    next.add(characterId)
  }
  return next
}

export function areNumberSetsEqual(left: ReadonlySet<number>, right: ReadonlySet<number>) {
  if (left.size !== right.size)
    return false
  for (const value of left) {
    if (!right.has(value))
      return false
  }
  return true
}
