import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  ADMIN_PROJECT_NAME,
  createTestSourceImage,
  expectUnionToMatchSnapshot,
  prepareStablePage,
  skipUnlessProject,
} from './helpers'

async function openCropDialog(page: Page) {
  const sourceImage = page.getByLabel('Source image')
  await sourceImage.setInputFiles({
    buffer: await createTestSourceImage(page),
    mimeType: 'image/png',
    name: '20250302_Artist.png',
  })
  await page.getByRole('heading', { name: 'Crop source image' }).waitFor()
  await expect(page.getByRole('button', { name: 'Use image' })).toBeEnabled()

  return sourceImage
}

test('create page stays visually stable', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { level: 1, name: 'Create' }).waitFor()
  await page.getByRole('heading', { name: 'Add Character' }).waitFor()
  await prepareStablePage(page)

  await expectUnionToMatchSnapshot(page, 'admin-create-page.png', [
    page.getByRole('heading', { level: 1, name: 'Create' }),
    page.getByRole('heading', { name: 'Add Character' }),
    page.getByRole('button', { name: 'Save character' }),
    page.getByRole('heading', { name: 'Add Commission Entry' }),
    page.getByRole('button', { name: 'Save commission' }),
  ])
})

test('create forms stay visually stable', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Character' }).waitFor()
  await prepareStablePage(page)

  await expectUnionToMatchSnapshot(page, 'admin-create-forms.png', [
    page.getByRole('heading', { name: 'Add Character' }),
    page.getByLabel('Name', { exact: true }),
    page.getByRole('heading', { name: 'Add Commission Entry' }),
    page.getByRole('button', { name: 'Save commission' }),
  ])
})

test('source image cropper exports the fixed JPEG contract', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  const sourceImage = await openCropDialog(page)

  await page.getByLabel('Rotate image').fill('37')
  await expect(page.getByText('37°', { exact: true })).toBeVisible()
  const zoom = page.getByLabel('Zoom image')
  await zoom.evaluate((input: HTMLInputElement) => {
    input.valueAsNumber = Number(input.min) + 0.35
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  const cropper = page.locator('[data-testid="cropper"]')
  const box = await cropper.boundingBox()
  if (!box) {
    throw new Error('Cropper did not render')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 2, box.y - box.height * 2, { steps: 4 })
  await page.mouse.up()

  await expect(page.getByRole('dialog')).toHaveScreenshot('admin-image-crop-dialog.png', {
    animations: 'disabled',
    caret: 'hide',
  })
  await page.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByRole('heading', { name: 'Crop source image' })).toBeHidden()

  const output = await sourceImage.evaluate(async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    if (!file) {
      return null
    }

    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    context?.drawImage(bitmap, 0, 0)
    const corners = context
      ? [
          context.getImageData(0, 0, 1, 1).data,
          context.getImageData(bitmap.width - 1, 0, 1, 1).data,
          context.getImageData(0, bitmap.height - 1, 1, 1).data,
          context.getImageData(bitmap.width - 1, bitmap.height - 1, 1, 1).data,
        ].map(pixel => Array.from(pixel))
      : []
    bitmap.close()

    return {
      corners,
      height: canvas.height,
      name: file.name,
      type: file.type,
      width: canvas.width,
    }
  })

  expect(output).toMatchObject({
    height: 525,
    name: '20250302_Artist.jpg',
    type: 'image/jpeg',
    width: 1280,
  })
  expect(output?.corners.every(pixel =>
    pixel[3] === 255
    && !(pixel[0] > 250 && pixel[1] > 250 && pixel[2] > 250),
  )).toBe(true)
})

test('source image cropper keeps controls available on a narrow screen', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  await openCropDialog(page)

  await expect(page.getByRole('dialog')).toHaveScreenshot('admin-image-crop-dialog-mobile.png', {
    animations: 'disabled',
    caret: 'hide',
  })
  await expect(page.getByRole('button', { name: 'Use image' })).toBeInViewport()
  await expect(page.getByLabel('Zoom image')).toBeInViewport()
  await expect(page.getByLabel('Rotate image')).toBeInViewport()

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expect(page.getByRole('button', { name: 'Use image' })).toBeInViewport()
  await expect(page.getByLabel('Zoom image')).toBeInViewport()
  await expect(page.getByLabel('Rotate image')).toBeInViewport()
})

test('cancelling a portrait recrop preserves the confirmed JPEG', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  const sourceImage = await openCropDialog(page)
  await page.getByRole('button', { name: 'Use image' }).click()
  await expect(page.getByRole('heading', { name: 'Crop source image' })).toBeHidden()

  await sourceImage.setInputFiles({
    buffer: await createTestSourceImage(page, { height: 1600, width: 800 }),
    mimeType: 'image/png',
    name: 'portrait-replacement.png',
  })
  await page.getByRole('heading', { name: 'Crop source image' }).waitFor()
  await expect(page.getByRole('button', { name: 'Use image' })).toBeEnabled()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByRole('heading', { name: 'Crop source image' })).toBeHidden()
  await expect.poll(() => sourceImage.evaluate(
    (input: HTMLInputElement) => input.files?.[0]?.name ?? null,
  )).toBe('20250302_Artist.jpg')
})

test('admin nav switches sections without a full reload', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Character' }).waitFor()

  await page.evaluate(() => {
    sessionStorage.removeItem('__admin-beforeunload')
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('__admin-beforeunload', '1')
    }, { once: true })
  })

  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('heading', { level: 1, name: 'Edit' }).waitFor()
  await page.getByRole('heading', { name: 'Existing commissions' }).waitFor()

  await expect(page).toHaveURL(/\/edit$/)
  await expect.poll(async () => page.evaluate(() => sessionStorage.getItem('__admin-beforeunload'))).toBeNull()
})

test('overview quick actions stay inside the client shell', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/')
  await page.getByRole('heading', { level: 1, name: 'Admin Overview' }).waitFor()
  await page.getByRole('heading', { name: 'Quick actions' }).waitFor()

  await page.evaluate(() => {
    sessionStorage.removeItem('__admin-beforeunload')
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('__admin-beforeunload', '1')
    }, { once: true })
  })

  await page.getByRole('link', { name: 'Edit existing' }).click()
  await page.getByRole('heading', { level: 1, name: 'Edit' }).waitFor()
  await page.getByRole('heading', { name: 'Existing commissions' }).waitFor()

  await expect(page).toHaveURL(/\/edit$/)
  await expect.poll(async () => page.evaluate(() => sessionStorage.getItem('__admin-beforeunload'))).toBeNull()
})
