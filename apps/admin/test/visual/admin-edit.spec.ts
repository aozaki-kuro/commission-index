import type { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import {
  ADMIN_PROJECT_NAME,
  createTestSourceImage,
  getAdminPageContainer,
  prepareStablePage,
  skipUnlessProject,
} from './helpers'

test('replacement source image is cropped before upload', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  let uploadBody: Buffer | null = null
  let uploadContentType = ''

  await page.route('**/api/admin/commissions/*/source-image', async (route) => {
    const request = route.request()
    uploadBody = request.postDataBuffer()
    uploadContentType = request.headers()['content-type'] ?? ''
    await route.fulfill({
      body: JSON.stringify({ message: 'Test source image replaced.', status: 'success' }),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/edit')
  await page.getByRole('heading', { name: 'Existing commissions' }).waitFor()
  const character = page
    .locator('[data-character-section][data-total-commissions]:not([data-total-commissions="0"])')
    .first()
  await character.locator('button[aria-expanded]').click()
  const commission = character.locator('button:has(img)').first()
  await commission.waitFor()
  await commission.click()

  const editDialog = page.getByRole('dialog')
  await editDialog.locator('input[type="file"]').setInputFiles({
    buffer: await createTestSourceImage(page),
    mimeType: 'image/png',
    name: 'replacement.png',
  })
  await page.getByRole('heading', { name: 'Crop source image' }).waitFor()
  await expect(page.getByRole('button', { name: 'Use image' })).toBeEnabled()
  await page.getByLabel('Rotate image').fill('37')
  await page.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByText('Test source image replaced.')).toBeVisible()

  expect(uploadContentType).toContain('multipart/form-data; boundary=')
  expect(uploadBody?.toString('latin1')).toContain('filename="replacement.jpg"')
  expect(uploadBody?.toString('latin1')).toContain('Content-Type: image/jpeg')
})

test('edit page stays visually stable', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/edit')
  await page.getByRole('heading', { level: 1, name: 'Edit' }).waitFor()
  await prepareStablePage(page)

  await expect(getAdminPageContainer(page)).toHaveScreenshot('admin-edit-page.png', {
    animations: 'disabled',
    caret: 'hide',
  })
})

test('edit manager stays visually stable', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/edit')
  const managerSection = page.locator('section.space-y-5').filter({
    has: page.getByRole('heading', { name: 'Existing commissions' }),
  })

  await page.getByRole('heading', { name: 'Existing commissions' }).waitFor()
  await prepareStablePage(page)

  await expect(managerSection).toHaveScreenshot('admin-edit-manager.png', {
    animations: 'disabled',
    caret: 'hide',
  })
})
