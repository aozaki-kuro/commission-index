/**
 * D1 stores commission `links` as a JSON array string ('[]' when empty); legacy/null rows arrive as '' or null.
 * Anything that is not a JSON array yields []. Items are stringified as-is unless `dropBlank` is set, in which
 * case each item is trimmed and blank items are removed (the admin interest view needs clean URL keys).
 */
export function parseCommissionLinksJson(raw: string | null | undefined, options: { dropBlank?: boolean } = {}): string[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    const links = parsed.map(link => String(link))
    return options.dropBlank
      ? links.map(link => link.trim()).filter(Boolean)
      : links
  }
  catch {
    return []
  }
}
