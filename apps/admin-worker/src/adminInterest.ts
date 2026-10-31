const RYBBIT_ORIGIN = 'https://sight.aozaki.cc'
const RYBBIT_SITE_ID = 3
// The web began reporting `commission` (publicId) on this day; older events only carry `sub_event`.
export const INTEREST_SINCE = '2026-10-31'

export type InterestResult
  = | { ok: true, counts: Record<string, number> }
    | { ok: false, message: string }

export async function loadInterestCounts(apiKey: string, now = new Date()): Promise<InterestResult> {
  const query = new URLSearchParams({
    event_name: 'i_want_to_see_it',
    start_date: INTEREST_SINCE,
    end_date: now.toISOString().slice(0, 10),
    time_zone: 'UTC',
  })

  let response: Response
  try {
    response = await fetch(`${RYBBIT_ORIGIN}/api/sites/${RYBBIT_SITE_ID}/events/properties?${query}`, {
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
  if (!Array.isArray(rows)) {
    return { ok: false, message: 'Rybbit API returned an unreadable body' }
  }

  const counts: Record<string, number> = {}
  for (const row of rows as Array<Record<string, unknown> | null>) {
    if (row?.propertyKey !== 'commission' || typeof row.propertyValue !== 'string') {
      continue
    }
    const publicId = row.propertyValue.trim()
    const count = row.count
    if (!publicId || typeof count !== 'number' || !Number.isFinite(count)) {
      continue
    }
    counts[publicId] = (counts[publicId] ?? 0) + count
  }
  return { ok: true, counts }
}
