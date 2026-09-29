export interface CommissionWorkGroupOption {
  id: string
  label: string
  highestPartNumber: number
}

export interface WorkGroupCandidate {
  characterName: string
  commissionDate: string | null
  creatorName: string | null
  workGroupId?: string | null
  partNumber?: number | null
}

export function getDefaultPartNumber(value: string, options: CommissionWorkGroupOption[]) {
  if (!value) {
    return ''
  }
  if (value === 'new') {
    return '1'
  }

  return String((options.find(option => option.id === value)?.highestPartNumber ?? 0) + 1)
}

export function buildWorkGroupOptions(rows: WorkGroupCandidate[]): CommissionWorkGroupOption[] {
  const groups = new Map<string, { candidate: WorkGroupCandidate, parts: number[] }>()

  for (const row of rows) {
    if (!row.workGroupId) {
      continue
    }

    const group = groups.get(row.workGroupId)
    if (group) {
      if (row.partNumber) {
        group.parts.push(row.partNumber)
      }
      continue
    }

    groups.set(row.workGroupId, {
      candidate: row,
      parts: row.partNumber ? [row.partNumber] : [],
    })
  }

  return [...groups].map(([id, { candidate, parts }]) => {
    const sortedParts = parts.toSorted((left, right) => left - right)
    const creatorName = candidate.creatorName?.trim() || 'Anon'
    const partSummary = sortedParts.length > 0
      ? ` · ${sortedParts.length} ${sortedParts.length === 1 ? 'part' : 'parts'}`
      : ''

    return {
      id,
      label: `${candidate.characterName} · ${candidate.commissionDate || 'Undated'} · ${creatorName}${partSummary}`,
      highestPartNumber: sortedParts.at(-1) ?? 0,
    }
  }).toSorted((left, right) => left.label.localeCompare(right.label))
}
