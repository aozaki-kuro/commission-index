import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectFixtureData } from './fixtureGuard'

// Characterization spec: pins the user-visible hash / archived / restore navigation of the home page so that
// changes to how sections are loaded can prove they keep behaving the same.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hasConfirmedAge', String(Date.now()))
  })
})

const publicId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Section ids come from the sidebar hrefs on purpose: they are derived from display names and must not be hard-coded.
async function sectionId(page: Page, displayName: string) {
  const href = await page
    .locator('[id="Character List"] a')
    .filter({ hasText: displayName })
    .first()
    .getAttribute('href')
  expect(href, `sidebar link for ${displayName}`).toMatch(/^#/)
  return (href as string).slice(1)
}

async function entryHash(page: Page, displayName: string, commissionId: number) {
  return `#${await sectionId(page, displayName)}-commission-${publicId(commissionId)}`
}

async function expectNearTop(locator: Locator) {
  await expect(locator).toBeVisible()
  await expect.poll(async () => (await locator.boundingBox())?.y ?? Number.NaN).toBeGreaterThanOrEqual(0)
  await expect.poll(async () => (await locator.boundingBox())?.y ?? Number.NaN).toBeLessThanOrEqual(250)
}

const characterPanel = (page: Page) => page.locator('[data-commission-view-panel="character"]')

async function expandArchived(page: Page) {
  await characterPanel(page).locator('[data-load-archived-characters="true"]').click()
  await expect(characterPanel(page)).toHaveAttribute('data-archived-visibility', 'visible')
}

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
    })

    test('deep link to a deferred active entry lands on it', async ({ page }) => {
      await page.goto('/')
      await expectFixtureData(page)
      const hash = await entryHash(page, '枫霜 Kaede', 202)
      await page.goto(`/${hash}`)
      await expectFixtureData(page)
      await expectNearTop(page.locator(hash))
    })

    test('deep link to an archived entry expands archived and lands on it', async ({ page }) => {
      await page.goto('/')
      await expectFixtureData(page)
      const hash = await entryHash(page, 'Orion Vale', 302)
      await page.goto(`/${hash}`)
      await expectFixtureData(page)
      await expect(characterPanel(page)).toHaveAttribute('data-archived-visibility', 'visible')
      await expectNearTop(page.locator(hash))
    })

    test('timeline deep link lands on the timeline copy', async ({ page }) => {
      await page.goto('/')
      await expectFixtureData(page)
      const hash = await entryHash(page, 'Lumi Verde', 101)
      await page.goto(`/?view=timeline${hash}`)
      await expectFixtureData(page)
      await expectNearTop(page.locator('[data-commission-view-panel="timeline"]').locator(hash))
    })

    test('reload restores expanded archived position', async ({ page }) => {
      await page.goto('/')
      await expectFixtureData(page)
      const hash = await entryHash(page, 'Orion Vale', 301)
      await expandArchived(page)
      const entry = page.locator(hash)
      await entry.evaluate(el => el.scrollIntoView({ block: 'start' }))
      await expectNearTop(entry)
      const before = await page.evaluate(() => window.scrollY)
      expect(before).toBeGreaterThan(0)

      await page.reload()
      await expectFixtureData(page)
      await expect(characterPanel(page)).toHaveAttribute('data-archived-visibility', 'visible')
      await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(40)
    })
  })
}

// Below lg the sidebar is replaced by the hamburger menu, so these are desktop-only.
test.describe('desktop sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  test('sidebar jump to a deferred character lands on its title', async ({ page }) => {
    await page.goto('/')
    await expectFixtureData(page)
    await page.locator('[id="Character List"] a').filter({ hasText: '枫霜 Kaede' }).first().click()
    await expectNearTop(page.locator('h2').filter({ hasText: '枫霜 Kaede' }).first())
  })

  test('archived toggle shows and collapses', async ({ page }) => {
    await page.goto('/')
    await expectFixtureData(page)
    const title = page.locator('h2').filter({ hasText: 'Orion Vale' })
    await expandArchived(page)
    await expect(title.first()).toBeVisible()

    // The sidebar <details> is open once archived is expanded; closing it collapses the list again.
    const details = page.locator('details[data-sidebar-archived-details]')
    await details.locator('summary').click()
    await expect(details).not.toHaveAttribute('open', '')
    await expect(characterPanel(page)).toHaveAttribute('data-archived-visibility', 'hidden')
    await expect(title.first()).toBeHidden()
  })
})
