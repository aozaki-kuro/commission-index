const NON_ALNUM_PATTERN = /[^a-z0-9]+/g
const EDGE_HYPHEN_PATTERN = /^-|-$/g
const PREVIEW_PART_SUFFIX_PATTERN = /\s*\((preview|part).*?\)$/i

/**
 * Convert a string to kebab-case.
 */
export function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(NON_ALNUM_PATTERN, '-')
    .replace(EDGE_HYPHEN_PATTERN, '')
}

/**
 * Remove preview/part suffixes from a file name.
 */
export function getBaseFileName(fileName: string): string {
  return fileName.replace(PREVIEW_PART_SUFFIX_PATTERN, '')
}
