import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { expectFixtureData } from './fixtureGuard'

const AGE_CONFIRM_KEY = 'hasConfirmedAge'

async function primeStableUiState(page: Page) {
  await page.addInitScript((timestampKey) => {
    window.localStorage.setItem(timestampKey, String(Date.now()))
  }, AGE_CONFIRM_KEY)
}

// The keyword chip row is filled and un-hidden by the search controller after hydration; screenshots taken
// before that miss the chips.
async function waitForKeywordChips(page: Page) {
  await expect(page.locator('#search-popular-keywords')).not.toHaveClass(/invisible/)
  await expect(page.locator('#search-keyword-list > li').first()).toBeVisible()
}

async function prepareStablePage(page: Page) {
  await expectFixtureData(page)
  await waitForKeywordChips(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `,
  })
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready
    }
  })
}

async function getUnionClip(locators: Locator[]) {
  const boxes = (
    await Promise.all(
      locators.map(async (locator) => {
        await locator.scrollIntoViewIfNeeded()
        return locator.boundingBox()
      }),
    )
  ).filter((box): box is NonNullable<typeof box> => box !== null)

  if (boxes.length === 0) {
    throw new Error('No visible elements were found for screenshot clipping.')
  }

  const x = Math.min(...boxes.map(box => box.x))
  const y = Math.min(...boxes.map(box => box.y))
  const right = Math.max(...boxes.map(box => box.x + box.width))
  const bottom = Math.max(...boxes.map(box => box.y + box.height))
  const padding = 12

  return {
    x: Math.max(0, Math.floor(x - padding)),
    y: Math.max(0, Math.floor(y - padding)),
    width: Math.ceil(right - x + padding * 2),
    height: Math.ceil(bottom - y + padding * 2),
  }
}

async function expectUnionToMatchSnapshot(page: Page, snapshotName: string, locators: Locator[]) {
  const clip = await getUnionClip(locators)

  expect(
    await page.screenshot({
      clip,
      animations: 'disabled',
      caret: 'hide',
    }),
  ).toMatchSnapshot(snapshotName)
}

test.beforeEach(async ({ page }) => {
  await primeStableUiState(page)
})

test.describe('home desktop shells', () => {
  test('search shell stays visually stable', async ({ page }) => {
    await page.goto('/')
    await page.locator('#commission-search-input').waitFor()
    await prepareStablePage(page)

    await expect(page.locator('#commission-search')).toHaveScreenshot('home-search-shell.png', {
      animations: 'disabled',
      caret: 'hide',
    })
  })

  test('desktop sidebars keep icon and spacing alignment', async ({ page }) => {
    await page.goto('/')
    await page.locator('#commission-search-input').waitFor()
    await prepareStablePage(page)

    await expect(page.locator('[id="Home Controls"]')).toHaveScreenshot(
      'home-controls-sidebar.png',
      {
        animations: 'disabled',
        caret: 'hide',
      },
    )
    await expect(page.locator('[id="Character List"]')).toHaveScreenshot(
      'home-character-sidebar.png',
      {
        animations: 'disabled',
        caret: 'hide',
      },
    )
  })

  // Guards the two-column chip field: 12px chips, characters | artists, and the overhang past the page column.
  test('desktop keyword browse popover stays visually stable when open', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('#search-browse-trigger')
    const panel = page.locator('#search-browse-popover')
    await trigger.waitFor()
    await prepareStablePage(page)
    await trigger.click()
    await expect(panel).toBeVisible()

    await expectUnionToMatchSnapshot(page, 'desktop-browse-open.png', [panel])
  })
})

test.describe('home mobile floating menus', () => {
  test.use({
    viewport: { width: 390, height: 844 },
  })

  test('mobile home shell stays visually stable', async ({ page }) => {
    await page.goto('/')
    await page.locator('#commission-search-input').waitFor()
    await prepareStablePage(page)

    await expectUnionToMatchSnapshot(page, 'mobile-home-shell.png', [
      page.locator('#commission-search'),
      page.locator('[data-mobile-view-tabs="true"]'),
    ])
  })

  test('mobile hamburger panel stays visually stable when open', async ({ page }) => {
    await page.goto('/')
    const toggle = page.locator('[data-mobile-hamburger-toggle="true"]')
    const root = page.locator('[data-mobile-hamburger="true"]')
    const panel = page.locator('[data-mobile-hamburger-panel="true"]')
    await toggle.waitFor()
    await expect(root).toHaveClass(/opacity-100/)
    await prepareStablePage(page)
    await toggle.click()
    await expect(root).toHaveAttribute('data-mobile-hamburger-open', 'true')
    await expect(panel).toHaveClass(/opacity-100/)

    await expectUnionToMatchSnapshot(page, 'mobile-hamburger-open.png', [toggle, panel])
  })

  // Guards the chip field's row rule: tinted name rows, a name chip leading its outlined terms, and their wraps.
  test('mobile keyword browse panel stays visually stable when open', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('[data-mobile-keyword-button-root="true"] button')
    const panel = page.locator('#search-browse-popover')
    await trigger.waitFor()
    await prepareStablePage(page)
    await trigger.click()
    await expect(panel).toBeVisible()

    await expectUnionToMatchSnapshot(page, 'mobile-browse-open.png', [panel])
  })
})
