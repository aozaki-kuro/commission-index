export const normalizeCreatorName = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  // Collapse split-file suffixes like "Q (part 1)" into a single creator key.
  const withoutPartSuffix = trimmed.replace(/\s+\(part\s+\d+\)$/i, '').trim()
  return withoutPartSuffix || null
}

export const normalizeAliases = (aliases: string[] | string): string[] => {
  const values = Array.isArray(aliases) ? aliases : aliases.split(/[,\n，、;；]/)
  const normalized = values.map(alias => alias.trim()).filter(Boolean)
  return Array.from(new Set(normalized))
}

export const parseAliasesJson = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return normalizeAliases(parsed.filter(alias => typeof alias === 'string') as string[])
    }
  } catch {
    // Fall back to delimiter-based parsing for legacy/manual values.
  }

  return normalizeAliases(value)
}

export const hasCjkCharacter = (value: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)
