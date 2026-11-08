export interface CommissionFileDetails {
  commissionDate: string
  creatorName: string
  workGroupId: string
  partNumber: number | null
  // Only the `<character>_<keyword>_<creator>_<YYYYMMDD>[_NN]` form carries these.
  characterToken: string | null
  keyword: string | null
}

function toIsoDate(compactDate: string) {
  const commissionDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
  const parsedDate = new Date(`${commissionDate}T00:00:00Z`)
  return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === commissionDate
    ? commissionDate
    : null
}

// Anchored on the date from the right so a creator name may itself contain `_`.
// The trailing `_NN` is a per-day file sequence, not a part number.
const PREFIXED_NAME_PATTERN = /^([^_]+)_([^_]+)_(.+)_(\d{8})(?:_\d{1,3})?$/

function extractPrefixedDetails(stem: string): CommissionFileDetails | null {
  const match = stem.match(PREFIXED_NAME_PATTERN)
  const commissionDate = match
    ? toIsoDate(match[4])
    : null
  if (!match || !commissionDate)
    return null

  const creatorName = match[3].trim()
  if (!creatorName)
    return null

  return {
    commissionDate,
    creatorName,
    workGroupId: '',
    partNumber: null,
    characterToken: match[1].trim(),
    keyword: match[2].trim(),
  }
}

export function extractCommissionDetails(fileName: string): CommissionFileDetails | null {
  const stem = fileName.trim().replace(/\.[^.]+$/, '')
  const match = stem.match(/^(\d{8})(?:_(.*))?$/)
  if (!match) {
    return extractPrefixedDetails(stem)
  }

  const commissionDate = toIsoDate(match[1])
  if (!commissionDate) {
    return null
  }

  const creatorName = match[2]?.trim() ?? ''
  const suffix = creatorName.match(/\s+\(part ([1-9]\d*)\)$/i)
  const partNumber = suffix
    ? Number(suffix[1])
    : null
  const hasValidPartNumber = partNumber !== null && Number.isSafeInteger(partNumber)

  return {
    commissionDate,
    creatorName: hasValidPartNumber
      ? creatorName.slice(0, -suffix![0].length).trim()
      : creatorName,
    workGroupId: hasValidPartNumber ? 'new' : '',
    partNumber: hasValidPartNumber ? partNumber : null,
    characterToken: null,
    keyword: null,
  }
}

// A file-name token names a character by its full name or by its last word ("K" → "Studio K").
// Ambiguous tokens resolve to nothing rather than guessing.
export function resolveCharacterToken<T extends { name: string }>(token: string, characters: readonly T[]): T | null {
  const needle = token.trim().toLocaleLowerCase()
  if (!needle)
    return null

  const byName = characters.filter(character => character.name.trim().toLocaleLowerCase() === needle)
  if (byName.length > 0) {
    return byName.length === 1
      ? byName[0]
      : null
  }

  const byLastWord = characters.filter(character => character.name.trim().split(/\s+/).at(-1)?.toLocaleLowerCase() === needle)
  return byLastWord.length === 1
    ? byLastWord[0]
    : null
}
