import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createTestSourceImage, mockAdminApi } from './helpers'

async function dropFile(page: Page, file: { base64: string, name: string, type: string }) {
  const dataTransfer = await page.evaluateHandle(({ base64, name, type }) => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], name, { type }))
    return transfer
  }, file)
  const artwork = page.getByRole('region', { name: 'Artwork' })
  await artwork.dispatchEvent('dragenter', { dataTransfer })
  await artwork.dispatchEvent('dragover', { dataTransfer })
  await artwork.dispatchEvent('drop', { dataTransfer })
}

function readAttachedImage(page: Page) {
  return page.getByLabel('Source image').evaluate(async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    if (!file)
      return null
    const bitmap = await createImageBitmap(file)
    const result = {
      height: bitmap.height,
      name: file.name,
      size: file.size,
      type: file.type,
      width: bitmap.width,
    }
    bitmap.close()
    return result
  })
}

async function confirmCrop(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Crop source image' })
  await expect(dialog.getByRole('button', { name: 'Use image' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Use image' }).click()
  await expect(dialog).toBeHidden()
}

test('dropped artwork is cropped, attached and can be re-cropped before saving', async ({ page }) => {
  await mockAdminApi(page)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Entry details' }).waitFor()
  await expect(page.getByRole('button', { name: 'Edit image' })).toHaveCount(0)

  const base64 = (await createTestSourceImage(page)).toString('base64')
  await dropFile(page, { base64, name: '20250302_Artist.png', type: 'image/png' })
  await confirmCrop(page)

  expect(await readAttachedImage(page)).toMatchObject({
    height: 525,
    name: '20250302_Artist.jpg',
    type: 'image/jpeg',
    width: 1280,
  })
  const dateInput = page.getByRole('textbox', { name: 'Delivery date' })
  await expect(dateInput).toHaveValue('2025-03-02')

  // Re-cropping reuses the original upload and must not re-suggest details typed since.
  await dateInput.fill('2024-01-01')
  const firstOutput = await readAttachedImage(page)
  await page.getByRole('button', { name: 'Edit image' }).click()
  const dialog = page.getByRole('dialog', { name: 'Crop source image' })
  await expect(dialog.getByRole('button', { name: 'Use image' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Rotate image right 90 degrees' }).click()
  const frame = dialog.locator('cropper-selection')
  const fittedFrame = await frame.boundingBox()
  const handle = await dialog.locator('cropper-handle[action="se-resize"]').boundingBox()
  if (!fittedFrame || !handle)
    throw new Error('Crop frame resize controls did not render')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x - 60, handle.y - 24, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeLessThan(fittedFrame.width)
  const confirmedFrame = await frame.boundingBox()
  await confirmCrop(page)

  const recropped = await readAttachedImage(page)
  expect(recropped).toMatchObject({
    height: 525,
    name: '20250302_Artist.jpg',
    type: 'image/jpeg',
    width: 1280,
  })
  expect(recropped?.size).not.toBe(firstOutput?.size)
  await expect(dateInput).toHaveValue('2024-01-01')
  await expect(page.getByText('Image updated (1280×525 JPG).')).toBeVisible()

  // The re-crop reopens on the confirmed frame; Reset returns to a fresh fit.
  await page.getByRole('button', { name: 'Edit image' }).click()
  const rotation = dialog.getByRole('status', { name: 'Image rotation' })
  await expect(rotation).toHaveText('90°')
  const reopenedFrame = await frame.boundingBox()
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs((reopenedFrame?.[key] ?? 0) - (confirmedFrame?.[key] ?? 0))).toBeLessThan(1)
  await dialog.getByRole('button', { name: 'Reset' }).click()
  await expect(rotation).toHaveText('0°')

  // Cancelling a re-crop keeps the confirmed image, and its frame for the next re-crop.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Edit image' }).click()
  await expect(rotation).toHaveText('90°')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(await readAttachedImage(page)).toEqual(recropped)

  // An unsupported drop reports an error and never replaces the confirmed image.
  await dropFile(page, {
    base64: btoa('not an image'),
    name: 'notes.txt',
    type: 'text/plain',
  })
  await expect(page.getByText('Choose a valid JPG or PNG image.')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect(await readAttachedImage(page)).toEqual(recropped)
})
