const KEYWORD_SPLIT_PATTERN = /[,\n，、;；]/
const NORMALIZE_SPACES_PATTERN = /\s+/g

// Trims and collapses whitespace runs; '' (not null) for a blank value.
export function normalizeKeyword(value: string): string {
  return value.trim().replace(NORMALIZE_SPACES_PATTERN, ' ')
}

export function normalizeKeywordKey(value: string): string {
  return normalizeKeyword(value).toLowerCase()
}

export function normalizeKeywordBaseTerm(value: string): string | null {
  return normalizeKeyword(value) || null
}

export function normalizeKeywordAliasKey(value: string): string | null {
  const normalized = normalizeKeywordBaseTerm(value)
  return normalized
    ? normalized.toLowerCase()
    : null
}

export function splitKeywordTerms(keyword: string | null | undefined) {
  return (keyword ?? '')
    .split(KEYWORD_SPLIT_PATTERN)
    .map(item => normalizeKeywordBaseTerm(item))
    .filter((item): item is string => Boolean(item))
}

export function normalizeKeywordAliases(aliases: string[] | string): string[] {
  const values = Array.isArray(aliases)
    ? aliases
    : aliases.split(KEYWORD_SPLIT_PATTERN)
  const normalized = values
    .map(value => normalizeKeywordBaseTerm(value))
    .filter((value): value is string => Boolean(value))

  const deduped = new Map<string, string>()
  normalized.forEach((value) => {
    const key = value.toLowerCase()
    if (!deduped.has(key))
      deduped.set(key, value)
  })

  return [
    ...deduped.values(),
  ]
}

export function parseKeywordAliasesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return normalizeKeywordAliases(parsed.filter(alias => typeof alias === 'string') as string[])
    }
  }
  catch {
    // 回退到分隔符解析，兼容历史手填值。
  }

  return normalizeKeywordAliases(value)
}

// Case-insensitive dedupe that keeps the first spelling and order; blank entries are dropped before counting.
export function dedupeKeywords(keywords: Iterable<string>, maxCount = Number.POSITIVE_INFINITY): string[] {
  const uniqueKeywords: string[] = []
  const seen = new Set<string>()

  for (const keyword of keywords) {
    const normalized = normalizeKeyword(keyword)
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueKeywords.push(normalized)

    if (uniqueKeywords.length >= maxCount) {
      break
    }
  }

  return uniqueKeywords
}
