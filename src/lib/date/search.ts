export interface DateSearchParts {
  year: string
  month?: string
}

const COMPACT_DATE_WITH_DAY_PATTERN = /^(\d{4})(\d{2})(\d{2})$/
const DELIMITED_YEAR_MONTH_DAY_PATTERN = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/
const DELIMITED_MONTH_YEAR_PATTERN = /^(\d{1,2})[-/.](\d{4})$/
const YEAR_ONLY_PATTERN = /^(\d{4})$/

const pad2 = (value: string) => value.padStart(2, '0')

function isValidDateParts({ year, month }: DateSearchParts) {
  const yearNum = Number(year)
  if (!Number.isInteger(yearNum) || year.length !== 4)
    return false

  if (!month)
    return true
  const monthNum = Number(month)
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12)
    return false
  return true
}

export function parseDateSearchInput(rawInput: string): DateSearchParts | null {
  const input = rawInput.trim()
  if (!input)
    return null

  let match = input.match(COMPACT_DATE_WITH_DAY_PATTERN)
  if (match) {
    const parts = { year: match[1], month: match[2] }
    return isValidDateParts(parts) ? parts : null
  }

  match = input.match(DELIMITED_YEAR_MONTH_DAY_PATTERN)
  if (match) {
    const parts = {
      year: match[1],
      month: pad2(match[2]),
    }
    return isValidDateParts(parts) ? parts : null
  }

  match = input.match(DELIMITED_MONTH_YEAR_PATTERN)
  if (match) {
    const parts = {
      year: match[2],
      month: pad2(match[1]),
    }
    return isValidDateParts(parts) ? parts : null
  }

  match = input.match(YEAR_ONLY_PATTERN)
  if (match) {
    const parts = { year: match[1] }
    return isValidDateParts(parts) ? parts : null
  }

  return null
}

export function toDateSearchTokens(parts: DateSearchParts): string[] {
  const tokens = [`date_y_${parts.year}`]
  if (parts.month)
    tokens.push(`date_ym_${parts.year}_${parts.month}`)
  return tokens
}

export function toPrimaryDateSearchToken(parts: DateSearchParts) {
  return parts.month ? `date_ym_${parts.year}_${parts.month}` : `date_y_${parts.year}`
}

export function buildDateSearchTokensFromCompactDate(compactDate: string): string[] {
  const parsed = parseDateSearchInput(compactDate)
  return parsed ? toDateSearchTokens(parsed) : []
}

export function normalizeDateQueryToken(token: string): string | null {
  const parsed = parseDateSearchInput(token)
  if (!parsed)
    return null
  return toPrimaryDateSearchToken(parsed)
}
