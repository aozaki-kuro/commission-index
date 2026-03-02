/**
 * Convert a string to kebab-case.
 */
export const kebabCase = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Remove preview/part suffixes from a file name.
 */
export function getBaseFileName(fileName: string): string {
  return fileName.replace(/\s*\((preview|part).*?\)$/i, '')
}
