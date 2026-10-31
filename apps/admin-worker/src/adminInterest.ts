const RYBBIT_ORIGIN = 'https://sight.aozaki.cc'
const RYBBIT_SITE_ID = 3
// The web began reporting `commission` (publicId) on this day; older events only carry `sub_event`.
export const INTEREST_SINCE = '2026-10-31'
const LINK_CLICK_WINDOW_DAYS = 365

type RybbitRows
  = | { ok: true, rows: Array<Record<string, unknown> | null> }
    | { ok: false, message: string }

export type InterestResult
  = | { ok: true, counts: Record<string, number> }
    | { ok: false, message: string }

export type LinkClicksResult
  = | { ok: true, since: string, until: string, clicks: Array<{ url: string, count: number }> }
    | { ok: false, message: string }

function toUtcDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

async function fetchRybbitRows(path: string, query: URLSearchParams, apiKey: string): Promise<RybbitRows> {
  let response: Response
  try {
    response = await fetch(`${RYBBIT_ORIGIN}/api/sites/${RYBBIT_SITE_ID}${path}?${query}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  }
  catch {
    // Never forward the thrown error: keep the key out of any message.
    return { ok: false, message: 'Could not reach Rybbit' }
  }

  if (!response.ok) {
    return { ok: false, message: `Rybbit API returned ${response.status}` }
  }

  let body: unknown
  try {
    body = await response.json()
  }
  catch {
    return { ok: false, message: 'Rybbit API returned an unreadable body' }
  }

  const rows = (body as { data?: unknown } | null)?.data
  return Array.isArray(rows)
    ? { ok: true, rows }
    : { ok: false, message: 'Rybbit API returned an unreadable body' }
}

export async function loadInterestCounts(apiKey: string, now = new Date()): Promise<InterestResult> {
  const result = await fetchRybbitRows('/events/properties', new URLSearchParams({
    event_name: 'i_want_to_see_it',
    start_date: INTEREST_SINCE,
    end_date: toUtcDate(now),
    time_zone: 'UTC',
  }), apiKey)
  if (!result.ok) {
    return result
  }

  const counts: Record<string, number> = {}
  for (const row of result.rows) {
    if (row?.propertyKey !== 'commission' || typeof row.propertyValue !== 'string') {
      continue
    }
    const publicId = row.propertyValue.trim()
    const count = row.count
    if (!publicId || !isCount(count)) {
      continue
    }
    counts[publicId] = (counts[publicId] ?? 0) + count
  }
  return { ok: true, counts }
}

/** Raw outbound-click counts per URL; admin owns matching them to commission links. */
export async function loadLinkClicks(apiKey: string, now = new Date()): Promise<LinkClicksResult> {
  const until = toUtcDate(now)
  const since = toUtcDate(new Date(now.getTime() - LINK_CLICK_WINDOW_DAYS * 86_400_000))
  const result = await fetchRybbitRows('/events/outbound', new URLSearchParams({
    start_date: since,
    end_date: until,
    time_zone: 'UTC',
  }), apiKey)
  if (!result.ok) {
    return result
  }

  const clicks = result.rows.flatMap(row =>
    typeof row?.url === 'string' && row.url.trim() && isCount(row.count)
      ? [
          {
            url: row.url.trim(),
            count: row.count,
          },
        ]
      : [],
  )
  return { ok: true, since, until, clicks }
}
