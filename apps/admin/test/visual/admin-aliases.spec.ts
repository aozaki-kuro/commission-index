import { test } from '@playwright/test'
import {
  ADMIN_PROJECT_NAME,
  expectUnionToMatchSnapshot,
  mockAdminApi,
  prepareStablePage,
  skipUnlessProject,
} from './helpers'

test('aliases dashboard stays visually stable', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await mockAdminApi(page)
  await page.goto('/aliases')
  await page.getByRole('heading', { level: 1, name: 'Aliases' }).waitFor()
  await prepareStablePage(page)

  await expectUnionToMatchSnapshot(page, 'admin-aliases-dashboard.png', [
    page.getByRole('heading', { name: 'Character aliases' }),
    page.getByRole('tablist'),
    page.getByRole('button', { name: 'Save character aliases' }),
    page.getByRole('textbox', { name: 'Briar aliases' }),
  ])
})
