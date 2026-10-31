import type { AdminBootstrapData, AdminCommissionSearchRow } from '@commission-index/domain'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockAdminApi } from './helpers'

function row(id: number, links: string, commissionDate: string): AdminCommissionSearchRow {
  return {
    id,
    publicId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    characterId: 1,
    characterName: 'Aster',
    commissionDate,
    creatorName: `Artist ${id}`,
    workGroupId: null,
    partNumber: null,
    fileName: `asset-${id}`,
    links,
    hidden: false,
  }
}

const rows = [
  row(1, '[]', '2026-05-01'),
  row(2, '', '2026-06-01'),
  row(3, '["https://example.com/work/3"]', '2026-07-01'),
  row(4, '[]', '2026-04-01'),
  row(5, '[]', '2026-08-01'),
]

const bootstrap: AdminBootstrapData = {
  characters: [
    {
      id: 1,
      name: 'Aster',
      status: 'active',
      sortOrder: 1,
      commissionCount: rows.length,
    },
  ],
  commissionSearchRows: rows,
  creatorAliases: [],
}

const interest = {
  since: '2026-10-31',
  counts: {
    [rows[0].publicId]: 2,
    [rows[1].publicId]: 2,
    [rows[2].publicId]: 9,
    [rows[3].publicId]: 7,
    'deleted-public-id': 4,
  },
}

const linkClicks = {
  since: '2026-01-01',
  until: '2026-10-31',
  clicks: [
    { url: 'http://www.Example.com/work/3/', count: 40 },
    { url: 'https://odaibako.net/u/someone', count: 99 },
  ],
}

const responses = {
  'ok': { status: 200, json: interest },
  'not-configured': {
    status: 503,
    json: { status: 'error', message: 'RYBBIT_API_KEY is not configured on the worker.' },
  },
  'rybbit-down': {
    status: 502,
    json: { status: 'error', message: 'Rybbit request failed.' },
  },
}

// Registered after mockAdminApi: later Playwright routes take precedence. Request counts include the dev-mode
// StrictMode effect replay, so assertions compare counts across a settle window instead of absolute values.
async function mockOverview(page: Page, mode: keyof typeof responses) {
  await mockAdminApi(page)
  await page.route('**/api/admin/bootstrap', route => route.fulfill({ json: bootstrap }))
  const control = { mode, interestRequests: 0, linkClicksMode: 'ok' as 'ok' | 'rybbit-down' }
  await page.route('**/api/admin/interest', async (route) => {
    control.interestRequests++
    await route.fulfill(responses[control.mode])
  })
  await page.route('**/api/admin/link-clicks', route => route.fulfill(control.linkClicksMode === 'ok'
    ? { json: linkClicks }
    : responses['rybbit-down']))
  return control
}

function mostWanted(page: Page) {
  return page.getByRole('region', { name: 'Most wanted' })
}

for (const { width, colorScheme } of [
  { width: 1280, colorScheme: 'light' as const },
  { width: 320, colorScheme: 'dark' as const },
]) {
  test(`most wanted ranks voted unpublished works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ colorScheme })
    await mockOverview(page, 'ok')
    await page.goto('/')
    const section = mostWanted(page)
    const items = section.getByRole('listitem')
    // Published (links) and zero-vote works are excluded; ties fall back to newest first.
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText('2026-04-01 · Artist 4')
    await expect(items.nth(0)).toContainText('7 votes')
    await expect(items.nth(1)).toContainText('2026-06-01 · Artist 2')
    await expect(items.nth(1)).toContainText('2 votes')
    await expect(items.nth(2)).toContainText('2026-05-01 · Artist 1')
    await expect(section).toContainText('Votes since 2026-10-31')
    await expect(section).toHaveAttribute('aria-busy', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

test('most wanted shows a calm not-connected state on 503 and never retries it', async ({ page }) => {
  const control = await mockOverview(page, 'not-configured')
  await page.goto('/')
  const section = mostWanted(page)
  await expect(section).toContainText('Visitor analytics is not connected.')
  await expect(section.getByRole('button')).toHaveCount(0)
  await expect(section.getByRole('alert')).toHaveCount(0)
  // The rest of the overview is unaffected.
  await expect(page.getByRole('region', { name: 'Latest commissions' }).getByRole('listitem')).toHaveCount(rows.length)
  const settled = control.interestRequests
  // Longer than the 250 ms retry backoff a 502 would get.
  await page.waitForTimeout(600)
  expect(control.interestRequests).toBe(settled)
})

test('most wanted offers a retry after a Rybbit failure', async ({ page }) => {
  const control = await mockOverview(page, 'rybbit-down')
  await page.goto('/')
  const section = mostWanted(page)
  await expect(section.getByRole('alert')).toContainText('Could not load visitor votes.')
  const failed = control.interestRequests
  control.mode = 'ok'
  await section.getByRole('button', { name: 'Try again' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(3)
  expect(control.interestRequests).toBe(failed + 1)
})

test('popular this year ranks link clicks with votes beside them', async ({ page }) => {
  await mockOverview(page, 'ok')
  await page.goto('/')
  const section = page.getByRole('region', { name: 'Popular this year' })
  const items = section.getByRole('listitem')
  await expect(section).toContainText('Link clicks since 2026-01-01')
  // Clicks first; votes-only works follow by votes, then newest.
  await expect(items).toHaveCount(4)
  await expect(items.nth(0)).toContainText('2026-07-01 · Artist 3')
  await expect(items.nth(0)).toContainText('40 clicks')
  await expect(items.nth(0)).toContainText('9 votes')
  await expect(items.nth(1)).toContainText('2026-04-01 · Artist 4')
  await expect(items.nth(1)).toContainText('0 clicks')
  await expect(items.nth(2)).toContainText('2026-06-01 · Artist 2')
  await expect(items.nth(3)).toContainText('2026-05-01 · Artist 1')
})

test('popular this year fails on its own and retries', async ({ page }) => {
  const control = await mockOverview(page, 'ok')
  control.linkClicksMode = 'rybbit-down'
  await page.goto('/')
  const section = page.getByRole('region', { name: 'Popular this year' })
  await expect(section.getByRole('alert')).toContainText('Could not load visitor link clicks.')
  await expect(mostWanted(page).getByRole('listitem')).toHaveCount(3)
  control.linkClicksMode = 'ok'
  await section.getByRole('button', { name: 'Try again' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(4)
})
