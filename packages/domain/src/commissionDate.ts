// Latest civil date on Earth is UTC+14. Judging "future" against it never rejects a
// legitimate "today" in any zone. The owner only asked to reject future dates; the zone is
// an assumption, so tighten this to a single zone if needed.
const LATEST_UTC_OFFSET_MS = 14 * 60 * 60 * 1000

export function getLatestCommissionDate(now: Date) {
  return new Date(now.getTime() + LATEST_UTC_OFFSET_MS).toISOString().slice(0, 10)
}

// Callers must validate the YYYY-MM-DD format and calendar first. Zero-padded ISO dates
// sort lexically, so a string comparison is exact.
export function isFutureCommissionDate(commissionDate: string, now: Date) {
  return commissionDate > getLatestCommissionDate(now)
}
