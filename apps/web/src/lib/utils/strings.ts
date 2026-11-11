const NON_ALNUM_PATTERN = /[^a-z0-9]+/g
const EDGE_HYPHEN_PATTERN = /^-|-$/g

/**
 * Convert a string to kebab-case.
 */
export function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(NON_ALNUM_PATTERN, '-')
    .replace(EDGE_HYPHEN_PATTERN, '')
}
