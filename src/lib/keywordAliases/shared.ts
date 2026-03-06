const KEYWORD_SPLIT_PATTERN = /[,\n，、;；]/

export const normalizeKeywordBaseTerm = (value: string): string | null => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized || null
}

export const normalizeKeywordAliasKey = (value: string): string | null => {
  const normalized = normalizeKeywordBaseTerm(value)
  return normalized ? normalized.toLowerCase() : null
}

export const splitKeywordTerms = (keyword: string | null | undefined) =>
  (keyword ?? '')
    .split(KEYWORD_SPLIT_PATTERN)
    .map(item => normalizeKeywordBaseTerm(item))
    .filter((item): item is string => Boolean(item))

export const normalizeKeywordAliases = (aliases: string[] | string): string[] => {
  const values = Array.isArray(aliases) ? aliases : aliases.split(KEYWORD_SPLIT_PATTERN)
  const normalized = values
    .map(value => normalizeKeywordBaseTerm(value))
    .filter((value): value is string => Boolean(value))

  const deduped = new Map<string, string>()
  normalized.forEach(value => {
    const key = value.toLowerCase()
    if (!deduped.has(key)) deduped.set(key, value)
  })

  return [...deduped.values()]
}

export const parseKeywordAliasesJson = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return normalizeKeywordAliases(parsed.filter(alias => typeof alias === 'string') as string[])
    }
  } catch {
    // Fall back to delimiter-based parsing for legacy/manual values.
  }

  return normalizeKeywordAliases(value)
}
