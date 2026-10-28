const PART_SUFFIX_PATTERN = /\s+\(part\s+\d+\)$/i
const ALIAS_SPLIT_PATTERN = /[,\n，、;；]/
const CJK_CHARACTER_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

export function normalizeCreatorName(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null

  const withoutPartSuffix = trimmed.replace(PART_SUFFIX_PATTERN, '').trim()
  return withoutPartSuffix || null
}

export function normalizeAliases(aliases: string[] | string): string[] {
  const values = Array.isArray(aliases)
    ? aliases
    : aliases.split(ALIAS_SPLIT_PATTERN)
  const normalized = values.map(alias => alias.trim()).filter(Boolean)
  return [
    ...new Set(normalized),
  ]
}

export function parseAliasesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return normalizeAliases(parsed.filter(alias => typeof alias === 'string') as string[])
    }
  }
  catch {
    // 回退到分隔符解析，兼容历史手填值。
  }

  return normalizeAliases(value)
}

export function hasCjkCharacter(value: string) {
  return CJK_CHARACTER_PATTERN.test(value)
}
