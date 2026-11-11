export interface CommissionFileDetails {
  commissionDate: string
  creatorName: string
  partNumber: number | null
  // Only the `<character>_<segments…>_<YYYYMMDD>[_NN]` form carries these; classifyFileNameSegments decides
  // which segment is the creator and which are keywords.
  characterToken: string | null
  segments: string[]
}

function toIsoDate(compactDate: string) {
  const commissionDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`
  const parsedDate = new Date(`${commissionDate}T00:00:00Z`)
  return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === commissionDate
    ? commissionDate
    : null
}

// `<character>_<segments…>_<YYYYMMDD>[_NN]`, anchored on the date from the right. Segment order is not fixed
// (`K_isj_ICHIZEN-RYUU`, `Lucia_Nanashi_TKS`). The trailing `_NN` is a per-day file sequence, not a part number,
// and an `ex` suffix on the date or sequence is a local variant marker; both are ignored.
const PREFIXED_NAME_PATTERN = /^([^_]+)_(.+)_(\d{8})(?:ex)?(?:_\d{1,3}(?:ex)?)?$/i

function extractPrefixedDetails(stem: string): CommissionFileDetails | null {
  const match = stem.match(PREFIXED_NAME_PATTERN)
  const commissionDate = match
    ? toIsoDate(match[3])
    : null
  if (!match || !commissionDate)
    return null

  const segments = match[2].split('_').map(segment => segment.trim())
  if (segments.some(segment => !segment))
    return null

  return {
    commissionDate,
    creatorName: '',
    partNumber: null,
    characterToken: match[1].trim(),
    segments,
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
  // NaN without a suffix; an absurdly long number is not a part either.
  const partNumber = Number(suffix?.[1])
  const hasPartNumber = Number.isSafeInteger(partNumber)

  return {
    commissionDate,
    creatorName: hasPartNumber
      ? creatorName.slice(0, suffix?.index).trim()
      : creatorName,
    partNumber: hasPartNumber ? partNumber : null,
    characterToken: null,
    segments: [],
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

export interface FileNameSegmentContext {
  creators: ReadonlyArray<{ creatorName: string, aliases: readonly string[] }>
  keywords: readonly string[]
}

// Local sort codes such as `SC02` are never a creator, even when nothing else in the name is recognised.
const SORT_CODE_PATTERN = /^[a-z]{1,4}\d{1,3}$/i

function splitNameWords(name: string) {
  return name.trim().split(/\s+|(?<=[a-z])(?=[A-Z])/u).filter(Boolean)
}

function findCreator(segment: string, creators: FileNameSegmentContext['creators']) {
  const unique = (matches: string[]) => {
    const names = new Set(matches)
    return names.size === 1
      ? [...names][0]
      : null
  }
  const exact = creators
    .filter(creator => [creator.creatorName, ...creator.aliases].some(name => namesMatch(segment, name)))
    .map(creator => creator.creatorName)
  if (exact.length > 0)
    return unique(exact)

  return unique(creators
    .filter(creator => creator.aliases.some(alias => splitNameWords(alias).some(word => namesMatch(segment, word))))
    .map(creator => creator.creatorName))
}

// Segments are classified by the data, not their position: a known keyword goes to keywords (canonical spelling),
// a known creator name or alias resolves to the stored creator name (`Nanashi` → `七市`). With no known creator the
// first unrecognised segment that is not a sort code is taken as a new creator; other unknowns are dropped rather
// than guessed into keywords.
export function classifyFileNameSegments(segments: readonly string[], context: FileNameSegmentContext) {
  const keywords: string[] = []
  const unknown: string[] = []
  let creatorName: string | null = null

  for (const segment of segments) {
    const keyword = context.keywords.find(candidate => namesMatch(segment, candidate))
    if (keyword) {
      if (!keywords.includes(keyword))
        keywords.push(keyword)
      continue
    }

    const creator = findCreator(segment, context.creators)
    if (creator) {
      creatorName ??= creator
      continue
    }

    unknown.push(segment)
  }

  return {
    creatorName: creatorName ?? unknown.find(segment => !SORT_CODE_PATTERN.test(segment)) ?? '',
    keyword: keywords.join(', '),
  }
}

export function buildFileNameSegmentContext(
  rows: ReadonlyArray<{ creatorName: string | null, keyword?: string | null }>,
  creatorAliases: ReadonlyArray<{ creatorName: string, aliases: readonly string[] }>,
): FileNameSegmentContext {
  const keywords = new Map<string, string>()
  const creators = new Map<string, string[]>()
  for (const row of rows) {
    for (const keyword of (row.keyword ?? '').split(',').map(value => value.trim()).filter(Boolean)) {
      if (!keywords.has(keyword.toLocaleLowerCase()))
        keywords.set(keyword.toLocaleLowerCase(), keyword)
    }
    const creatorName = row.creatorName?.trim()
    if (creatorName && !creators.has(creatorName))
      creators.set(creatorName, [])
  }
  for (const { creatorName, aliases } of creatorAliases) {
    creators.set(creatorName, [
      ...(creators.get(creatorName) ?? []),
      ...aliases,
    ])
  }

  return {
    creators: [...creators].map(([creatorName, aliases]) => ({ creatorName, aliases })),
    keywords: [
      ...keywords.values(),
    ],
  }
}
