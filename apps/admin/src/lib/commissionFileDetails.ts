export interface CommissionFileDetails {
  commissionDate: string
  creatorName: string
  workGroupId: string
  partNumber: number | null
  // Only the `<character>_[<keyword>_]<creator>_<YYYYMMDD>[_NN]` form carries these.
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

// `<character>_<creator>_<YYYYMMDD>[_NN]`, or with a keyword segment after the character (Studio K files:
// `K_isj_ICHIZEN-RYUU_20261108_01`). Anchored on the date from the right; the trailing `_NN` is a per-day file
// sequence, not a part number.
const PREFIXED_NAME_PATTERN = /^([^_]+)_(.+)_(\d{8})(?:_\d{1,3})?$/

function extractPrefixedDetails(stem: string): CommissionFileDetails | null {
  const match = stem.match(PREFIXED_NAME_PATTERN)
  const commissionDate = match
    ? toIsoDate(match[3])
    : null
  if (!match || !commissionDate)
    return null

  const [first, ...rest] = match[2].split('_').map(segment => segment.trim())
  const keyword = rest.length > 0
    ? first
    : null
  const creatorName = (rest.length > 0
    ? rest.join('_')
    : first).trim()
  if (!creatorName || keyword === '')
    return null

  return {
    commissionDate,
    creatorName,
    workGroupId: '',
    partNumber: null,
    characterToken: match[1].trim(),
    keyword,
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

// Case, spaces, hyphens and punctuation do not distinguish names; `*` (masked names such as `K*toha`) stands for
// exactly one character on either side.
function normalizeName(name: string) {
  return Array.from(name.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}*]/gu, ''))
}

function namesMatch(left: string, right: string) {
  const a = normalizeName(left)
  const b = normalizeName(right)
  return a.length > 0
    && a.length === b.length
    && a.every((char, index) => char === b[index] || char === '*' || b[index] === '*')
}

// A file-name token names a character by its full name or by one word of it (`K` → `Studio K`,
// `Kotoha` → `K*toha`). Ambiguous tokens resolve to nothing rather than guessing.
export function resolveCharacterToken<T extends { name: string }>(token: string, characters: readonly T[]): T | null {
  if (!normalizeName(token).some(char => char !== '*'))
    return null

  const byName = characters.filter(character => namesMatch(token, character.name))
  if (byName.length > 0) {
    return byName.length === 1
      ? byName[0]
      : null
  }

  const byWord = characters.filter(character => character.name.trim().split(/\s+/).some(word => namesMatch(token, word)))
  return byWord.length === 1
    ? byWord[0]
    : null
}
