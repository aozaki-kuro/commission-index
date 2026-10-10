import { expect, test } from '@playwright/test'
import { ADMIN_PROJECT_NAME, mockAdminApi, prepareStablePage, skipUnlessProject } from './helpers'

test('featured keyword editor stays visually stable', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await mockAdminApi(page)
  await page.goto('/suggestion')
  await page.locator('form').waitFor()
  await expect(
    page.getByRole('list', { name: 'Featured keyword order' }).getByRole('listitem').first(),
  ).toBeVisible()
  await prepareStablePage(page)

  await expect(page.locator('form')).toHaveScreenshot('admin-suggestion-dashboard.png', {
    animations: 'disabled',
    caret: 'hide',
  })
})
