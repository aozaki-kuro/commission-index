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

async function dropCropAndRecrop(page: Page) {
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
  const rotation = dialog.getByRole('status', { name: 'Image rotation' })
  await expect(rotation).toHaveText('90°')
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
}

// Hold <cropper-image> in a genuine loading state (incomplete, 0×0) past the first ResizeObserver frame,
// the order slower CI runners hit; locally the blob usually decodes first.
async function holdCropperImageLoad(page: Page) {
  await page.route('**/__hold-image', () => new Promise(() => {}))
  await page.addInitScript(() => {
    const setAttribute = Element.prototype.setAttribute
    Element.prototype.setAttribute = function (name: string, value: string) {
      if (this instanceof HTMLImageElement && name === 'src' && value.startsWith('blob:') && !this.isConnected && !this.dataset.held) {
        this.dataset.held = '1'
        setAttribute.call(this, name, '/__hold-image')
        setTimeout(() => setAttribute.call(this, name, value), 300)
        return
      }
      setAttribute.call(this, name, value)
    }
  })
}

test('dropped artwork is cropped, attached and can be re-cropped before saving', async ({ page }) => {
  await dropCropAndRecrop(page)
})

test('the cropper fits and restores frames only after the image has loaded', async ({ page }) => {
  await holdCropperImageLoad(page)
  await dropCropAndRecrop(page)
})

function readAttachedPixels(page: Page, points: Array<{ x: number, y: number }>) {
  return page.getByLabel('Source image').evaluate(async (input: HTMLInputElement, points) => {
    const file = input.files?.[0]
    if (!file)
      return []
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    return points.map(({ x, y }) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3)))
  }, points)
}

test('overflow mode lets the frame take the full image height and fills the sides', async ({ page }) => {
  await mockAdminApi(page)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Entry details' }).waitFor()

  // Same proportions as a 4093×2894 artwork, which is narrower than the 1280×525 frame.
  const base64 = (await createTestSourceImage(page, { height: 1447, width: 2046 })).toString('base64')
  await dropFile(page, { base64, name: 'wide.png', type: 'image/png' })
  const dialog = page.getByRole('dialog', { name: 'Crop source image' })
  await expect(dialog.getByRole('button', { name: 'Use image' })).toBeEnabled()
  const frame = dialog.locator('cropper-selection')
  const image = dialog.locator('cropper-image')
  const overflow = dialog.getByRole('button', { name: 'Extend frame past image' })
  const matchFill = dialog.getByRole('button', { name: 'Fill empty area with the image\'s edge colour' })

  await dialog.getByRole('button', { name: 'Fit' }).click()
  const containedFrame = await frame.boundingBox()
  await expect(matchFill).toHaveCount(0)
  await overflow.click()
  await expect(overflow).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Fit' }).click()
  await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeGreaterThan(containedFrame!.width + 1)
  const overflowFrame = (await frame.boundingBox())!
  const imageBox = (await image.boundingBox())!
  expect(overflowFrame.width).toBeGreaterThan(imageBox.width)
  // The kept axis still carries the 2px-of-1280 bleed on each side.
  expect(Math.abs(overflowFrame.height - imageBox.height)).toBeLessThan(imageBox.height * 0.02)
  expect(overflowFrame.y).toBeGreaterThanOrEqual(imageBox.y - 0.5)
  await confirmCrop(page)

  const [left, center, right] = await readAttachedPixels(page, [
    { x: 4, y: 262 },
    { x: 640, y: 262 },
    { x: 1275, y: 262 },
  ])
  for (const side of [left, right]) {
    for (const channel of side!)
      expect(channel).toBeGreaterThan(245)
  }
  expect(center![0]).toBeLessThan(60)

  // The re-crop reopens in overflow mode on the same frame; matching the edges fills the sides with their colour.
  await page.getByRole('button', { name: 'Edit image' }).click()
  await expect(overflow).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => Math.round((await frame.boundingBox())?.width ?? 0)).toBe(Math.round(overflowFrame.width))
  await matchFill.click()
  await expect(matchFill).toHaveAttribute('aria-pressed', 'true')
  await confirmCrop(page)
  const [matchedLeft, matchedRight] = await readAttachedPixels(page, [
    { x: 4, y: 262 },
    { x: 1275, y: 262 },
  ])
  for (const side of [matchedLeft, matchedRight]) {
    // createTestSourceImage paints its outer band #9d3757.
    for (const [index, channel] of side!.entries())
      expect(Math.abs(channel - [0x9D, 0x37, 0x57][index])).toBeLessThan(8)
  }

  // Both choices survive a re-crop; switching overflow off pulls the frame back inside the image.
  await page.getByRole('button', { name: 'Edit image' }).click()
  await expect(matchFill).toHaveAttribute('aria-pressed', 'true')
  await overflow.click()
  await expect(matchFill).toHaveCount(0)
  await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeLessThanOrEqual(imageBox.width)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})
