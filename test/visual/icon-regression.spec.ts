import { expect, test, type Locator, type Page } from '@playwright/test'

const AGE_CONFIRM_KEY = 'hasConfirmedAge'

const primeStableUiState = async (page: Page) => {
  await page.addInitScript(timestampKey => {
    window.localStorage.setItem(timestampKey, String(Date.now()))
  }, AGE_CONFIRM_KEY)
}

const prepareStablePage = async (page: Page) => {
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

const getUnionClip = async (locators: Locator[]) => {
  const boxes = (
    await Promise.all(
      locators.map(async locator => {
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

const expectUnionToMatchSnapshot = async (
  page: Page,
  snapshotName: string,
  locators: Locator[],
) => {
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
})

test.describe('home mobile floating menus', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile home shell stays visually stable', async ({ page }) => {
    await page.goto('/')
    await page.locator('#commission-search-input').waitFor()
    await prepareStablePage(page)

    await expectUnionToMatchSnapshot(page, 'mobile-home-shell.png', [
      page.locator('#commission-search'),
      page.locator('[data-mobile-view-tabs="true"]'),
    ])
  })

  test('mobile language menu stays visually stable when open', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('[data-mobile-language-menu="true"] > summary')
    await trigger.waitFor()
    await trigger.click()
    await page.locator('[data-mobile-language-menu-panel="true"]').waitFor()
    await prepareStablePage(page)

    await expectUnionToMatchSnapshot(page, 'mobile-language-menu-open.png', [
      trigger,
      page.locator('[data-mobile-language-menu-panel="true"]'),
    ])
  })

  test('mobile hamburger panel stays visually stable when open', async ({ page }) => {
    await page.goto('/')
    const toggle = page.locator('[data-mobile-hamburger-toggle="true"]')
    await toggle.waitFor()
    await toggle.click()
    await page.locator('[data-mobile-hamburger-panel="true"]').waitFor()
    await prepareStablePage(page)

    await expectUnionToMatchSnapshot(page, 'mobile-hamburger-open.png', [
      toggle,
      page.locator('[data-mobile-hamburger-panel="true"]'),
    ])
  })
})

test.describe('admin suggestion dashboard', () => {
  test('featured keyword editor stays visually stable', async ({ page }) => {
    await page.goto('/admin/suggestion')
    await page.locator('form').waitFor()
    await prepareStablePage(page)

    await expect(page.locator('form')).toHaveScreenshot('admin-suggestion-dashboard.png', {
      animations: 'disabled',
      caret: 'hide',
    })
  })
})
