import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
  test(`alias sections preserve drafts and stable controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' })
    let failSave = true
    let savedRows: unknown
    const payload = {
      characterAliases: [{ characterName: 'Lucia', aliases: ['Luci'], commissionCount: 3 }],
      creatorAliases: [{ creatorName: '七市', aliases: ['Nanashi', 'Nana'], commissionCount: 2 }],
      keywordAliases: [
        { baseKeyword: 'Full body', aliases: ['Standing'], commissionCount: 2 },
        { baseKeyword: 'A-very-long-base-keyword-that-must-wrap-without-expanding-the-page', aliases: ['Another alias'], commissionCount: 1 },
      ],
    }
    await page.route('**/api/admin/**', async (route) => {
      const request = route.request()
      if (new URL(request.url()).pathname.endsWith('/aliases/bootstrap')) {
        await route.fulfill({ json: payload })
        return
      }
      if (request.method() === 'POST' && request.url().endsWith('/keyword-aliases/batch')) {
        savedRows = request.postDataJSON().rows
        if (failSave) {
          await route.fulfill({ status: 400, json: { status: 'error', message: 'Fixture alias save rejected. '.repeat(25) } })
          return
        }
        payload.keywordAliases[0].aliases = ['Changed alias']
        await route.fulfill({ json: { status: 'success', message: 'Saved.' } })
        return
      }
      await route.fulfill({ status: 404, json: { message: 'Unexpected fixture request' } })
    })
    await page.goto('/aliases')
    await page.getByLabel('Lucia aliases', { exact: true }).fill('Unsaved character draft')
    await page.getByRole('tab', { name: 'Keyword' }).click()
    const field = page.getByLabel('Full body aliases', { exact: true })
    await field.fill('Changed alias')
    await page.getByRole('tab', { name: 'Creator' }).click()
    await expect(page.getByLabel('七市 aliases', { exact: true })).toHaveValue('Nanashi, Nana')
    await page.getByRole('tab', { name: 'Character' }).click()
    await expect(page.getByLabel('Lucia aliases', { exact: true })).toHaveValue('Unsaved character draft')
    await page.getByRole('tab', { name: 'Keyword' }).click()
    await expect(field).toHaveValue('Changed alias')
    const form = page.locator('#aliases-panel-keyword form')
    const save = page.getByRole('button', { name: 'Save keyword aliases', exact: true })
    const geometry = () => form.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const saveRect = element.querySelector('button[type="submit"]')!.getBoundingClientRect()
      return { width: rect.width, height: rect.height, saveX: saveRect.x - rect.x, saveY: saveRect.y - rect.y }
    })
    const before = await geometry()
    await save.click()
    await expect(page.getByText('Unable to save keyword aliases.', { exact: false })).toBeVisible()
    await page.getByText('Unable to save keyword aliases.', { exact: false }).click()
    expect(await geometry()).toEqual(before)
    expect(savedRows).toEqual([{ baseKeyword: 'Full body', aliases: 'Changed alias' }])
    await expect(field).toHaveValue('Changed alias')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Dismiss notification' }).click()
    await page.screenshot({ path: testInfo.outputPath(`aliases-${width}.png`), fullPage: true })
    failSave = false
    await save.click()
    await expect(save).toBeDisabled()
    await expect(field).toHaveValue('Changed alias')
    await page.getByRole('tab', { name: 'Character' }).click()
    await expect(page.getByLabel('Lucia aliases', { exact: true })).toHaveValue('Unsaved character draft')
  })
}
