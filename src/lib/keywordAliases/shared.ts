const KEYWORD_SPLIT_PATTERN = /[,\n，、;；]/
const NORMALIZE_SPACES_PATTERN = /\s+/g

export function normalizeKeywordBaseTerm(value: string): string | null {
  const normalized = value.trim().replace(NORMALIZE_SPACES_PATTERN, ' ')
  return normalized || null
}

export function normalizeKeywordAliasKey(value: string): string | null {
  const normalized = normalizeKeywordBaseTerm(value)
  return normalized ? normalized.toLowerCase() : null
}

export function splitKeywordTerms(keyword: string | null | undefined) {
  return (keyword ?? '')
    .split(KEYWORD_SPLIT_PATTERN)
    .map(item => normalizeKeywordBaseTerm(item))
    .filter((item): item is string => Boolean(item))
}

export function normalizeKeywordAliases(aliases: string[] | string): string[] {
  const values = Array.isArray(aliases) ? aliases : aliases.split(KEYWORD_SPLIT_PATTERN)
  const normalized = values
    .map(value => normalizeKeywordBaseTerm(value))
    .filter((value): value is string => Boolean(value))

  const deduped = new Map<string, string>()
  normalized.forEach((value) => {
    const key = value.toLowerCase()
    if (!deduped.has(key))
      deduped.set(key, value)
  })

  return [...deduped.values()]
}

export function parseKeywordAliasesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return normalizeKeywordAliases(parsed.filter(alias => typeof alias === 'string') as string[])
    }
  }
  catch {
    // Fall back to delimiter-based parsing for legacy/manual values.
  }

  return normalizeKeywordAliases(value)
}
