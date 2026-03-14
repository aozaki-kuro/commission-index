const COMPACT_DATE_PATTERN = /^\d{8}$/
const DASH_PATTERN = /-/g

/**
 * Parse a date string in "yyyyMMdd" format.
 */
export function parseDateString(dateStr: string): Date | null {
  if (!COMPACT_DATE_PATTERN.test(dateStr))
    return null

  const year = Number.parseInt(dateStr.slice(0, 4), 10)
  const month = Number.parseInt(dateStr.slice(4, 6), 10) - 1
  const day = Number.parseInt(dateStr.slice(6, 8), 10)

  const date = new Date(Date.UTC(year, month, day))

  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date
    : null
}

/**
 * Format a Date object.
 */
export function formatDate(date: Date, format: 'yyyy/MM/dd' | 'readable'): string {
  if (format === 'yyyy/MM/dd') {
    return date.toISOString().slice(0, 10).replace(DASH_PATTERN, '/')
  }
  if (format === 'readable') {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  throw new Error(`Unsupported date format: ${format}`)
}

/**
 * Parse and format a "yyyyMMdd" date string.
 */
export function parseAndFormatDate(dateStr: string, format: 'yyyy/MM/dd' | 'readable'): string {
  const date = parseDateString(dateStr)
  return date ? formatDate(date, format) : ''
}
