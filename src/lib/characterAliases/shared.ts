const CHARACTER_ALIAS_SPLIT_PATTERN = /[,\n，、;；]/
const NORMALIZE_SPACES_PATTERN = /\s+/g

export function normalizeCharacterAliasName(value: string): string | null {
  const normalized = value.trim().replace(NORMALIZE_SPACES_PATTERN, ' ')
  return normalized || null
}

export function normalizeCharacterAliasKey(value: string): string | null {
  const normalized = normalizeCharacterAliasName(value)
  return normalized ? normalized.toLowerCase() : null
}

export function normalizeCharacterAliases(aliases: string[] | string): string[] {
  const values = Array.isArray(aliases) ? aliases : aliases.split(CHARACTER_ALIAS_SPLIT_PATTERN)
  const normalized = values
    .map(value => normalizeCharacterAliasName(value))
    .filter((value): value is string => Boolean(value))

  const deduped = new Map<string, string>()
  normalized.forEach((value) => {
    const key = value.toLowerCase()
    if (!deduped.has(key))
      deduped.set(key, value)
  })

  return [...deduped.values()]
}

export function parseCharacterAliasesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return normalizeCharacterAliases(
        parsed.filter(alias => typeof alias === 'string') as string[],
      )
    }
  }
  catch {
    // Fall back to delimiter-based parsing for legacy/manual values.
  }

  return normalizeCharacterAliases(value)
}
