import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  ADMIN_PROJECT_NAME,
  createTestSourceImage,
  expectUnionToMatchSnapshot,
  prepareStablePage,
  rotateCropImage,
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
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  await prepareStablePage(page)

  await expectUnionToMatchSnapshot(page, 'admin-create-page.png', [
    page.getByRole('heading', { level: 1, name: 'Create' }),
    page.getByRole('button', { name: 'New character' }),
    page.getByRole('heading', { name: 'Add Commission Entry' }),
    page.getByRole('button', { name: 'Save commission' }),
  ])
})

test('new character dialog stays visually stable and preserves the commission draft', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  await page.getByRole('textbox', { name: 'Creator (optional)' }).fill('Draft creator')
  await page.getByRole('button', { name: 'New character' }).click()
  const dialog = page.getByRole('dialog', { name: 'New character' })
  await expect(dialog).toBeVisible()
  await prepareStablePage(page)

  await expect(dialog).toHaveScreenshot('admin-create-character-dialog.png', {
    animations: 'disabled',
    caret: 'hide',
  })
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Creator (optional)' })).toHaveValue('Draft creator')
})

test('commission metadata fields align and the date picker fits desktop and mobile', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/create')
    await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()

    const fieldPairs = [
      [page.getByText('Character', { exact: true }), page.getByRole('combobox', { name: 'Character' })],
      [page.getByText('Delivery date', { exact: true }), page.getByRole('textbox', { name: 'Delivery date' })],
      [page.getByText('Creator (optional)', { exact: true }), page.getByRole('textbox', { name: 'Creator (optional)' })],
    ] as const

    for (const [label, control] of fieldPairs) {
      const labelText = await label.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return {
          x: range.getBoundingClientRect().x,
          inset: Number.parseFloat(getComputedStyle(element).paddingLeft),
        }
      })
      const controlBox = await control.boundingBox()
      expect(controlBox, `control should render at ${width}px`).not.toBeNull()
      expect(labelText.inset).toBeGreaterThan(0)
      expect(Math.abs(labelText.x - controlBox!.x - labelText.inset)).toBeLessThanOrEqual(1)
    }

    await page.getByRole('button', { name: 'Choose delivery date' }).click()
    const calendar = page.getByRole('dialog', { name: 'Choose delivery date' })
    await expect(calendar).toBeVisible()
    await expect(calendar).toBeInViewport()
    await expect(calendar.getByRole('button', { name: /[A-Z][a-z]+ \d{1,2}, \d{4}/ }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(calendar).toBeHidden()

    const groupSelect = page.getByRole('combobox', { name: 'Part grouping' })
    await expect(groupSelect).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Part of a multi-part work' }).check()
    await groupSelect.click()
    await page.getByRole('option', { name: 'New multi-part group' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Part number' })).toHaveValue('1')
    await expect(page.locator('input[name="workGroupId"]')).toHaveValue('new')
    await page.getByRole('checkbox', { name: 'Part of a multi-part work' }).uncheck()
    await expect(groupSelect).toHaveCount(0)
    await expect(page.getByRole('spinbutton', { name: 'Part number' })).toHaveCount(0)
    await expect(page.locator('input[name="workGroupId"]')).toHaveValue('')
  }
})

test('source image cropper exports the fixed JPEG contract', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  const sourceImage = await openCropDialog(page)

  await rotateCropImage(page, 37)
  await expect(page.getByLabel('Image rotation')).toHaveText('37°')

  const frame = page.locator('cropper-selection')
  const initialFrame = await frame.boundingBox()
  const southeastHandle = page.locator('cropper-handle[action="se-resize"]')
  const handleBox = await southeastHandle.boundingBox()
  if (!initialFrame || !handleBox) {
    throw new Error('Crop frame resize controls did not render')
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x - 80, handleBox.y - 32, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await frame.boundingBox())?.width ?? 0).toBeLessThan(initialFrame.width)

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
  await expect(page.getByRole('button', { name: 'Rotate image freely' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Rotate image right 90 degrees' })).toBeInViewport()

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await expect(page.getByRole('button', { name: 'Use image' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Rotate image freely' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Rotate image right 90 degrees' })).toBeInViewport()
})

test('source image cropper supports touch transform gestures', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  await openCropDialog(page)

  const rotation = page.getByLabel('Image rotation')
  await expect(rotation).toHaveText('0°')
  await page.locator('cropper-canvas').evaluate(async (canvas) => {
    const rect = canvas.getBoundingClientRect()
    const target = canvas.querySelector(':scope > cropper-handle[action="move"]')
    if (!target)
      throw new Error('Missing image move surface')

    const createPointer = (
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => new PointerEvent(type, {
      bubbles: true,
      buttons: type === 'pointerup' ? 0 : 1,
      cancelable: true,
      clientX,
      clientY,
      isPrimary: pointerId === 1,
      pressure: type === 'pointerup' ? 0 : 0.5,
      pointerId,
      pointerType: 'touch',
    })
    const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    target.dispatchEvent(createPointer('pointerdown', 1, centerX - 55, centerY))
    target.dispatchEvent(createPointer('pointerdown', 2, centerX + 55, centerY))
    await nextFrame()
    document.dispatchEvent(createPointer('pointermove', 1, centerX - 70, centerY - 35))
    await nextFrame()
    document.dispatchEvent(createPointer('pointermove', 2, centerX + 70, centerY + 35))
    await nextFrame()
    document.dispatchEvent(createPointer('pointerup', 1, centerX - 70, centerY - 35))
    document.dispatchEvent(createPointer('pointerup', 2, centerX + 70, centerY + 35))
  })

  await expect.poll(async () => Number.parseInt(await rotation.textContent() ?? '0', 10)).not.toBe(0)
  const rotationAfterGesture = await rotation.textContent()
  await page.setViewportSize({ width: 390, height: 780 })
  await expect(rotation).toHaveText(rotationAfterGesture ?? '')
  await expect(page.getByRole('button', { name: 'Use image' })).toBeEnabled()
})

test('crop dialog uses the site glass and adaptive neutral workspace', async ({ page }, testInfo) => {
  skipUnlessProject(testInfo, ADMIN_PROJECT_NAME)
  await page.goto('/create')
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()
  await openCropDialog(page)

  const overlay = page.locator('[data-dialog-overlay="crop"]')
  const workspace = page.locator('.crop-workspace')
  await expect(overlay).toHaveCSS('backdrop-filter', /blur\(20px\)/)
  await expect(workspace).toHaveCSS('background-color', 'rgb(209, 209, 214)')

  await expect(page).toHaveScreenshot('admin-image-crop-overlay.png', {
    animations: 'disabled',
    caret: 'hide',
  })

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(workspace).toHaveCSS('background-color', 'rgb(44, 44, 46)')
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
  await page.getByRole('heading', { name: 'Add Commission Entry' }).waitFor()

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

// 使用模拟 API，覆盖两个入口；动画开启时必须等内容和遮罩实际退场。
for (const routeName of ['create', 'edit']) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const action of ['Cancel', 'Close', 'Escape', 'Use image']) {
      test(`crop lifecycle ${routeName} ${reducedMotion} ${action}`, async ({ page }) => {
        const commission = {
          id: 1,
          characterId: 1,
          characterName: 'Crop fixture',
          fileName: '20250302_Test',
          links: [],
          hidden: false,
        }
        await page.route('**/api/admin/**', async (route) => {
          const path = new URL(route.request().url()).pathname
          if (path.includes('/source-image/')) {
            await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="525"/>' })
            return
          }
          const body = path.endsWith('/bootstrap')
            ? {
                characters: [{ id: 1, name: 'Crop fixture', status: 'active', sortOrder: 0, commissionCount: 1 }],
                commissionSearchRows: [{ ...commission, links: '' }],
                creatorAliases: [],
              }
            : path.endsWith('/commissions')
              ? { commissions: [commission] }
              : { status: 'success', message: 'Crop fixture uploaded.' }
          await route.fulfill({ json: body })
        })
        await page.emulateMedia({ reducedMotion })
        await page.goto(`/${routeName}`)
        if (routeName === 'edit') {
          const character = page.locator('[data-character-section]').first()
          await character.locator('button[aria-expanded]').click()
          await character.locator('button:has(img)').first().click()
        }
        const input = page.locator('input[type="file"]').first()
        await input.waitFor({ state: 'attached' })
        await input.setInputFiles({
          buffer: await createTestSourceImage(page),
          mimeType: 'image/png',
          name: 'crop.png',
        })
        const crop = page.getByRole('dialog', { name: /Crop source image/ })
        await expect(crop.getByRole('button', { name: 'Use image' })).toBeEnabled()
        await page.mouse.click(5, 5)
        await expect(crop).toHaveAttribute('data-state', 'open')
        await crop.getByRole('button', { name: 'Rotate image left 90 degrees' }).click()
        await expect(page.getByLabel('Image rotation')).toHaveText('-90°')
        await page.evaluate(() => {
          const events: string[] = []
          Object.assign(window, { cropExitEvents: events })
          document.addEventListener('animationend', (event) => {
            const target = event.target as HTMLElement
            if (event.animationName === 'dialog-crop-content-out')
              events.push(target.getAttribute('data-dialog-overlay') === 'crop' ? 'overlay' : 'content')
          })
        })
        if (action === 'Escape')
          await page.keyboard.press('Escape')
        else
          await crop.getByRole('button', { name: action, exact: true }).click()
        await expect(crop).toHaveCount(0)
        await expect(page.locator('[data-dialog-overlay="crop"]')).toHaveCount(0)
        const events = await page.evaluate(() => (window as Window & { cropExitEvents: string[] }).cropExitEvents)
        expect(events.sort()).toEqual(reducedMotion === 'reduce' ? [] : ['content', 'overlay'])
        if (routeName === 'edit') {
          await expect(page.getByRole('dialog')).toHaveCount(1)
          if (action === 'Use image')
            await expect(page.getByText('Crop fixture uploaded.')).toBeVisible()
        }
        else if (action === 'Use image') {
          const file = await input.evaluate((element: HTMLInputElement) => element.files?.[0]?.type)
          expect(file).toBe('image/jpeg')
        }
      })
    }
  }
}
