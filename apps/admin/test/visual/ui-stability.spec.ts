import type { Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createTestSourceImage, rotateCropImage } from './helpers'

const commissions = [1, 2].map(id => ({
  id,
  publicId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  characterId: id,
  characterName: `Character ${id}`,
  commissionDate: '2026-09-29',
  creatorName: 'Artist',
  workGroupId: id === 1 ? 'existing-group' : null,
  partNumber: id === 1 ? 2 : null,
  fileName: `asset-${id}`,
  design: 'Reference',
  description: null,
  keyword: 'studio, skeb',
  links: ['https://example.com/work'],
  hidden: false,
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function mockApi(page: Page, firstCharacterCount = 1) {
  const rows = [
    ...Array.from({ length: firstCharacterCount }, (_, index) => ({
      ...commissions[0],
      id: index === 0 ? 1 : index + 2,
      publicId: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    })),
    commissions[1],
  ]
  // 默认 fixture 保留原始身份，便于编辑断言。
  if (rows[0]?.id === 1)
    rows[0].publicId = commissions[0].publicId
  const control = {
    bootstrapGate: Promise.resolve(),
    characterGate: Promise.resolve(),
    suggestionGate: Promise.resolve(),
    aliasesGate: Promise.resolve(),
    rebuildGate: Promise.resolve(),
    rebuildRequests: 0,
    mutations: [] as Array<{ path: string, body: unknown }>,
    bootstrapRequests: 0,
    characterRequests: 0,
    failBootstrap: false,
    failCharacter: false,
    createdCharacter: false,
    createSucceeds: false,
    archivedCharacter: false,
    secondCharacterName: 'Character 2',
  }
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/health')) {
      await route.fulfill({ json: { status: 'ok', message: 'Fixture connection ready.' } })
      return
    }
    if (pathname.endsWith('/aliases/bootstrap')) {
      await control.aliasesGate
      await route.fulfill({ json: {
        characterAliases: [{ characterName: 'Character 1', commissionCount: 1, aliases: ['First'] }],
        creatorAliases: [{ creatorName: '七市', commissionCount: 2, aliases: ['Nanashi', 'Nana'] }],
        keywordAliases: [{ baseKeyword: 'studio', commissionCount: 2, aliases: ['workshop'] }],
      } })
      return
    }
    if (pathname.endsWith('/suggestion')) {
      await control.suggestionGate
      if (request.method() === 'GET') {
        await route.fulfill({ json: { featuredKeywords: ['Summer', 'Winter'], keywordOptions: ['Summer', 'Winter', 'Spring', 'Autumn', 'Rain', 'Snow', 'A very long descriptive keyword '.repeat(5)] } })
      }
      else {
        control.mutations.push({ path: pathname, body: request.postDataJSON() })
        await route.fulfill({ json: { status: 'success', message: 'Suggestions saved.' } })
      }
      return
    }
    if (pathname.endsWith('/rebuild')) {
      control.rebuildRequests++
      await control.rebuildGate
      await route.fulfill({ json: { status: 'success', message: 'Queued.' } })
      return
    }
    if (/\/(?:character-|keyword-)?aliases\/batch$/.test(pathname) && request.method() === 'POST') {
      control.mutations.push({ path: pathname, body: request.postDataJSON() })
      await route.fulfill({ json: { status: 'success', message: 'Aliases saved.' } })
      return
    }
    if (pathname.endsWith('/bootstrap')) {
      control.bootstrapRequests++
      await control.bootstrapGate
      if (control.failBootstrap) {
        await route.fulfill({ status: 500, json: { message: 'Fixture network unavailable' } })
        return
      }
      const characters = commissions.map(row => ({ id: row.characterId, name: row.id === 2 ? control.secondCharacterName : row.characterName, status: row.id === 2 && control.archivedCharacter ? 'archived' : 'active', sortOrder: row.id, commissionCount: row.id === 1 ? firstCharacterCount : 1 }))
      if (control.createdCharacter)
        characters.push({ id: 3, name: 'New fixture character', status: 'active', sortOrder: 3, commissionCount: 0 })
      await route.fulfill({ json: {
        characters,
        commissionSearchRows: rows.map(row => ({ ...row, links: JSON.stringify(row.links) })),
        creatorAliases: [],
      } })
      return
    }
    if (/characters\/\d+\/commissions$/.test(pathname)) {
      control.characterRequests++
      await control.characterGate
      await route.fulfill(control.failCharacter
        ? { status: 500, json: { message: 'Fixture character unavailable' } }
        : { json: { commissions: rows.filter(row => pathname.includes(`/characters/${row.characterId}/`)) } })
      return
    }
    if (pathname.endsWith('/characters') && request.method() === 'POST') {
      control.createdCharacter = true
      await route.fulfill({ json: { status: 'success', message: 'Character created.' } })
      return
    }
    if (pathname.endsWith('/commissions') && request.method() === 'POST' && control.createSucceeds) {
      await route.fulfill({ json: { status: 'success', message: 'Commission saved.' } })
      return
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 400, json: { status: 'error', message: 'Fixture save rejected. '.repeat(20) } })
      return
    }
    if (pathname.endsWith('/source-image')) {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="525"><rect width="1280" height="525" fill="#d7dce0"/><circle cx="640" cy="262" r="150" fill="#a7b5ba"/></svg>' })
      return
    }
    await route.fulfill({ status: 404, json: { message: 'Unexpected fixture API' } })
  })
  return control
}

async function relativeBox(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const form = element.closest('form')?.getBoundingClientRect()
    return { x: box.x, y: box.y - (form?.y ?? 0), width: box.width, height: box.height }
  })
}

async function openEdit(page: Page) {
  await page.goto('/edit')
  const character = page.locator('[data-character-section]').first()
  await character.locator('button[aria-expanded]').click()
  await character.locator('[data-commission-id]').click()
  return page.getByRole('dialog')
}

async function waitForMaintenanceReady(page: Page, path: string) {
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  if (path === '/')
    await expect(page.getByRole('region', { name: 'Collection summary' })).toHaveAttribute('aria-busy', 'false')
  if (path === '/create')
    await expect(page.getByRole('combobox', { name: 'Character', exact: true })).toBeEnabled()
  if (path === '/edit')
    await expect(page.getByRole('button', { name: 'Rename Character 1', exact: true })).toBeVisible()
  if (path === '/aliases')
    await expect(page.getByLabel('Character 1 aliases', { exact: true })).toBeEnabled()
  if (path === '/suggestion')
    await expect(page.getByRole('button', { name: 'Save suggestions' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).map(animation => ({ state: animation.playState, time: animation.currentTime, timing: animation.effect?.getComputedTiming() }))), { timeout: 3000, message: '等待当前运行的有限动画结束，不持有跨状态的 finished Promise' }).toEqual([])
}

async function collectWorkspaceBoundaries(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const content = main.querySelector(':scope > div')!
    const surface = [...content.children].find(element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))!
    const elements = { main, header: main.querySelector(':scope > header')!, heading: main.querySelector('h1')!, content, surface }
    return Object.fromEntries(Object.entries(elements).map(([name, element]) => {
      const { left, right, width } = element.getBoundingClientRect()
      return [name, { left, right, width }]
    })) as Record<keyof typeof elements, { left: number, right: number, width: number }>
  })
}

for (const { viewport, colorScheme } of [
  { viewport: { width: 1280, height: 720 }, colorScheme: 'dark' as const },
  { viewport: { width: 2560, height: 1440 }, colorScheme: 'light' as const },
]) {
  test.describe(`HiDPI ${viewport.width}x${viewport.height} DPR2 ${colorScheme}`, () => {
    test.use({ viewport, deviceScaleFactor: 2, colorScheme })
    test('continuous SPA navigation keeps shared workspace boundaries', async ({ page }, testInfo) => {
      await mockApi(page, 18)
      let unloadCount = 0
      await page.exposeFunction('recordWorkspaceUnload', () => {
        unloadCount++
      })
      await page.goto('/')
      await page.evaluate(() => {
        addEventListener('beforeunload', () => {
          void (window as unknown as { recordWorkspaceUnload: () => Promise<void> }).recordWorkspaceUnload()
        })
      })
      const documentHandle = await page.evaluateHandle(() => document)
      const routes = [
        { path: '/', label: 'Overview' },
        { path: '/create', label: 'Create' },
        { path: '/edit', label: 'Edit' },
        { path: '/aliases', label: 'Aliases' },
        { path: '/suggestion', label: 'Suggestion' },
      ]
      const measurements: Array<{ path: string, boundaries: Awaited<ReturnType<typeof collectWorkspaceBoundaries>> }> = []
      for (const [index, route] of routes.entries()) {
        if (index > 0) {
          await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: route.label, exact: true }).click()
          await expect(page).toHaveURL(new RegExp(`${route.path}$`))
        }
        await waitForMaintenanceReady(page, route.path)
        if (route.path === '/edit') {
          await page.locator('[data-character-section]').first().locator('button[aria-expanded]').click()
          await expect(page.locator('[data-commission-id]')).toHaveCount(18)
        }
        const boundaries = await collectWorkspaceBoundaries(page)
        measurements.push({ path: route.path, boundaries })
        expect(await page.evaluate(handle => handle === document, documentHandle), '路由切换必须保留同一个 Document').toBe(true)
        expect(unloadCount, 'SPA 导航不应触发 beforeunload').toBe(0)
        expect(await page.evaluate(() => devicePixelRatio)).toBe(2)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
        const baseline = measurements[0].boundaries
        for (const name of Object.keys(boundaries) as Array<keyof typeof boundaries>) {
          expect(Math.abs(boundaries[name].left - baseline[name].left), `${route.label} ${name} 左边界跳变`).toBeLessThanOrEqual(1)
          expect(Math.abs(boundaries[name].right - baseline[name].right), `${route.label} ${name} 右边界跳变`).toBeLessThanOrEqual(1)
        }
        for (const name of ['heading', 'content', 'surface'] as const) {
          expect(Math.abs(boundaries[name].left - boundaries.header.left), `${route.label} ${name} 与标题外边界不齐`).toBeLessThanOrEqual(1)
          expect(Math.abs(boundaries[name].right - boundaries.header.right), `${route.label} ${name} 未占满共享内容宽度`).toBeLessThanOrEqual(1)
        }
        if (route.path === '/edit' && viewport.width === 2560) {
          const cards = await page.locator('[data-commission-id]').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top))
          expect(cards.filter(top => Math.abs(top - cards[0]) < 1)).toHaveLength(5)
        }
        await page.screenshot({ path: testInfo.outputPath(`workspace-navigation-${index}-${route.label.toLowerCase()}.png`), scale: 'device' })
      }
      await documentHandle.dispose()
      const metricsPath = testInfo.outputPath('workspace-navigation-boundaries.json')
      await writeFile(metricsPath, `${JSON.stringify({ viewport, deviceScaleFactor: 2, colorScheme, unloadCount, measurements }, null, 2)}\n`)
      await testInfo.attach('连续导航工作区边界', { path: metricsPath, contentType: 'application/json' })
    })
  })
}

test('cold create keeps one form and a neutral character placeholder while data arrives', async ({ page }) => {
  const control = await mockApi(page)
  const gate = deferred()
  control.bootstrapGate = gate.promise
  await page.goto('/create')
  await page.evaluate(() => document.fonts.ready)
  const character = page.getByRole('combobox', { name: 'Character', exact: true })
  await expect(character).toBeDisabled()
  await expect(character).toHaveText('Select character')
  await expect(page.getByText('No characters available', { exact: false })).toHaveCount(0)
  const before = await relativeBox(character)
  const formHeight = await page.locator('form').evaluate(element => element.getBoundingClientRect().height)
  gate.resolve()
  await expect(character).toBeEnabled()
  expect(await relativeBox(character)).toEqual(before)
  expect(await page.locator('form').evaluate(element => element.getBoundingClientRect().height)).toBe(formHeight)
  await expect(page.locator('[data-notice-viewport="page"] > *')).toHaveCount(0)
  await expect(page.getByText('Refreshing', { exact: false })).toHaveCount(0)
})

test('create feedback and duplicate review never move fields or save; 320px fits', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/create')
  const character = page.getByRole('combobox', { name: 'Character', exact: true })
  await expect(character).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  const before = await relativeBox(character)
  await page.getByLabel('Source image', { exact: true }).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await expect(page.getByText('Choose a valid JPG or PNG image.')).toBeVisible()
  expect(await relativeBox(character)).toEqual(before)
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await character.click()
  await page.getByRole('option', { name: 'Character 2', exact: true }).click()
  await page.getByRole('textbox', { name: 'Delivery date', exact: true }).fill('2026-09-29')
  const save = page.getByRole('button', { name: 'Save commission', exact: true })
  const saveBefore = await relativeBox(save)
  await page.getByRole('textbox', { name: 'Creator (optional)', exact: true }).fill('Artist')
  await expect(page.locator('[data-notice-viewport] summary').filter({ hasText: 'possible duplicate' })).toBeVisible()
  expect(await relativeBox(save)).toEqual(saveBefore)
  await page.locator('[data-notice-viewport] summary').filter({ hasText: 'possible duplicate' }).click()
  expect(await relativeBox(save)).toEqual(saveBefore)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.screenshot({ path: testInfo.outputPath('create-320.png'), fullPage: true })
})

test('edit aligns field edges, preserves grouped values and floats persistent errors', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  const dialog = await openEdit(page)
  await page.evaluate(() => document.fonts.ready)
  const title = dialog.getByRole('heading').first()
  await expect(title.locator('p').first()).not.toContainText('#0000000')
  await expect(title).toHaveAttribute('title', commissions[0].publicId)
  const identity = dialog.locator('[data-commission-public-id]')
  await expect(identity).toHaveCount(1)
  await expect(identity).toHaveText('#0000000')
  await expect(identity.locator('..')).toContainText('Character 1')
  await expect(dialog.locator('form')).not.toContainText('#0000000')
  const character = dialog.getByRole('combobox', { name: 'Character', exact: true })
  const links = dialog.getByRole('textbox', { name: 'Links (optional, one per line)', exact: true })
  const creator = dialog.getByRole('textbox', { name: 'Creator (optional)', exact: true })
  const keyword = dialog.getByRole('textbox', { name: 'Keywords (optional, comma-separated, search-only)', exact: true })
  const boxes = await Promise.all([character, links, creator, keyword].map(relativeBox))
  expect(boxes[0].x).toBe(boxes[1].x)
  expect(boxes[1].x).toBe(boxes[3].x)
  expect(boxes[2].x + boxes[2].width).toBeCloseTo(boxes[1].x + boxes[1].width, 1)
  await expect(dialog.locator('label[for="create-commission-character"]')).toHaveCSS('padding-left', '4px')
  const checkbox = dialog.getByRole('checkbox', { name: 'Part of a multi-part work' })
  await expect(checkbox).toBeChecked()
  await checkbox.uncheck()
  await expect(dialog.getByRole('spinbutton', { name: 'Part number' })).toHaveCount(0)
  await checkbox.check()
  await expect(dialog.getByRole('spinbutton', { name: 'Part number' })).toHaveValue('2')
  const before = await relativeBox(character)
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await expect(dialog.getByText('Choose a valid JPG or PNG image.')).toBeVisible()
  expect(await relativeBox(character)).toEqual(before)
  await dialog.getByRole('button', { name: 'Dismiss notification' }).click()
  const save = dialog.getByRole('button', { name: 'Save changes', exact: true })
  const saveBefore = await relativeBox(save)
  await save.click()
  await expect(dialog.getByText('Unable to update commission.')).toBeVisible()
  await dialog.getByText('Unable to update commission.').click()
  expect(await relativeBox(character)).toEqual(before)
  expect(await relativeBox(save)).toEqual(saveBefore)
  await page.screenshot({ path: testInfo.outputPath('edit-desktop.png'), fullPage: true })
  await dialog.getByRole('button', { name: 'Dismiss notification' }).click()
  await page.screenshot({ path: testInfo.outputPath('edit-clean-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await dialog.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('edit-mobile.png'), fullPage: true })
})

test('one-card loading stays the same height, warm refresh is silent and search is lazy', async ({ page }) => {
  const control = await mockApi(page)
  await page.goto('/create')
  await expect(page.getByRole('combobox', { name: 'Character', exact: true })).toBeEnabled()
  const bootstrapGate = deferred()
  control.bootstrapGate = bootstrapGate.promise
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  const heading = page.getByRole('heading', { name: 'Existing commissions', exact: true })
  await expect(heading).toBeVisible()
  const before = await heading.boundingBox()
  bootstrapGate.resolve()
  await expect(page.getByText('Refreshing', { exact: false })).toHaveCount(0)
  expect(await heading.boundingBox()).toEqual(before)
  const gate = deferred()
  control.characterGate = gate.promise
  const first = page.locator('[data-character-section]').first()
  const following = page.locator('[data-character-section]').nth(1)
  await first.locator('button[aria-expanded]').click()
  await expect.poll(() => control.characterRequests).toBeGreaterThan(0)
  const y = (await following.boundingBox())!.y
  gate.resolve()
  await expect(first.locator('[data-commission-id]')).toBeVisible()
  expect((await following.boundingBox())!.y).toBeCloseTo(y, 1)
  const requests = control.characterRequests
  await page.getByRole('searchbox', { name: 'Search commissions' }).fill('Character 2')
  await expect(page.getByRole('button').filter({ hasText: 'Character 2 ·' })).toBeVisible()
  expect(control.characterRequests).toBe(requests)
  await page.getByRole('button').filter({ hasText: 'Character 2 ·' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(control.characterRequests).toBe(requests + 1)
})

test('new character dialog preserves the commission draft and refreshes its options', async ({ page }) => {
  await mockApi(page)
  await page.goto('/create')
  await page.getByRole('textbox', { name: 'Creator (optional)', exact: true }).fill('Draft artist')
  await page.getByRole('button', { name: 'New character', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New character' })
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('New fixture character')
  await dialog.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Creator (optional)', exact: true })).toHaveValue('Draft artist')
  await page.getByRole('combobox', { name: 'Character', exact: true }).click()
  await expect(page.getByRole('option', { name: 'New fixture character', exact: true })).toBeVisible()
})

test('normal motion retains page, disclosure and dialog animations', async ({ page }) => {
  await mockApi(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/create')
  await expect(page.locator('form').locator('..')).toHaveCSS('animation-name', 'tabFade')
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  const first = page.locator('[data-character-section]').first()
  await first.locator('button[aria-expanded]').click()
  await expect(first.locator('[id$="-panel"]')).toHaveCSS('transition-duration', '0.2s')
  await first.locator('[data-commission-id]').click()
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'dialog-content-in')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'none')
})

test('reload restores a long-list anchor after delayed data without another scroll jump', async ({ page }) => {
  const control = await mockApi(page, 30)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/edit')
  const first = page.locator('[data-character-section]').first()
  await first.locator('button[aria-expanded]').click()
  await expect(first.locator('[data-commission-id]')).toHaveCount(30)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 1200))
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('admin-dashboard-scroll') ?? '{}').top)).toBe(1200)
  const anchor = await page.evaluate(() => JSON.parse(sessionStorage.getItem('admin-dashboard-scroll')!).anchor as { id: number, offset: number })
  const gate = deferred()
  control.characterGate = gate.promise
  await page.reload()
  await expect.poll(() => control.characterRequests).toBe(2)
  gate.resolve()
  await expect(first.locator('[data-commission-id]')).toHaveCount(30)
  await expect.poll(() => page.locator(`[data-commission-id="${anchor.id}"]`).evaluate(element => element.getBoundingClientRect().top)).toBeCloseTo(anchor.offset, 0)
  const restoredTop = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 100)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(restoredTop)
})

test('mobile image crop retains rotation, preview and retry until a successful save', async ({ page }) => {
  const control = await mockApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/create')
  const source = page.locator('input[name="sourceImage"]')
  await source.setInputFiles({
    buffer: await createTestSourceImage(page),
    mimeType: 'image/png',
    name: '20260929_Artist.png',
  })
  const dialog = page.getByRole('dialog', { name: 'Crop source image' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Use image' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Use image' })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Rotate image freely' })).toBeInViewport()
  await rotateCropImage(page, 17)
  await expect(dialog.getByLabel('Image rotation')).toHaveText('17°')
  await dialog.getByRole('button', { name: 'Use image' }).click()
  await expect(dialog).toBeHidden()
  const output = await source.evaluate(async (input: HTMLInputElement) => {
    const file = input.files![0]!
    const bitmap = await createImageBitmap(file)
    const result = { type: file.type, width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return result
  })
  expect(output).toEqual({ type: 'image/jpeg', width: 1280, height: 525 })
  await expect.poll(() => page.getByAltText('Cropped artwork ready to upload').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1280)
  await expect(page.getByRole('button', { name: 'Save commission' })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Delivery date' })).toHaveValue('2026-09-29')
  await expect(page.getByRole('textbox', { name: 'Creator (optional)' })).toHaveValue('Artist')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('combobox', { name: 'Character', exact: true }).click()
  await page.getByRole('option', { name: 'Character 2', exact: true }).click()
  await page.getByRole('textbox', { name: 'Links (optional, one per line)' }).fill('https://example.com/new')
  await page.getByRole('button', { name: 'Save commission' }).click()
  await expect(page.getByText('Unable to save commission.', { exact: false })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Links (optional, one per line)' })).toHaveValue('https://example.com/new')
  expect(await source.evaluate((input: HTMLInputElement) => input.files?.[0]?.type)).toBe('image/jpeg')
  await expect.poll(() => page.getByAltText('Cropped artwork ready to upload').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1280)
  await page.getByRole('button', { name: 'Dismiss notification' }).last().click()
  control.createSucceeds = true
  await page.getByRole('button', { name: 'Save commission' }).click()
  await expect(page.getByAltText('Cropped artwork ready to upload')).toHaveCount(0)
  expect(await source.evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0)
})

test('mobile workspace keeps all pages and navigation usable', async ({ page }, testInfo) => {
  const width = 320
  const colorScheme = 'dark'
  await mockApi(page, 6)
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme })
  for (const path of ['/', '/create', '/edit', '/aliases', '/suggestion']) {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const nav = page.getByRole('navigation', { name: 'Admin sections' })
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(nav.getByRole('link').filter({ hasNotText: 'Public Site' })).toHaveCount(4)
    if (path === '/create')
      await expect(page.getByRole('combobox', { name: 'Character', exact: true })).toBeEnabled()
    if (path === '/aliases')
      await expect(page.getByLabel('Character 1 aliases', { exact: true })).toBeEnabled()
    if (path === '/suggestion')
      await expect(page.getByRole('button', { name: 'Save suggestions' })).toBeEnabled()
    if (path === '/')
      await expect(page.getByRole('region', { name: 'Collection summary' })).toHaveAttribute('aria-busy', 'false')
    if (path === '/edit') {
      await page.locator('[data-character-section]').first().locator('button[aria-expanded]').click()
      await expect(page.locator('[data-commission-id]')).toHaveCount(6)
      await expect(page.getByRole('button', { name: 'Enter reorder mode' })).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: testInfo.outputPath(`${path.slice(1) || 'overview'}-${width}-${colorScheme}.png`), fullPage: true })
  }
})

test('short desktop navigation and keyboard skip link keep every destination reachable', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1280, height: 300 })
  await page.goto('/create')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  const publicLink = page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Public Site' }).filter({ visible: true })
  await publicLink.focus()
  await expect(publicLink).toBeInViewport()
})

test('all maintenance pages remain usable with doubled text size', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1280, height: 1000 })
  for (const path of ['/', '/create', '/edit', '/aliases', '/suggestion']) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    if (path === '/')
      await expect(page.getByRole('region', { name: 'Collection summary' })).toHaveAttribute('aria-busy', 'false')
    else if (path === '/aliases')
      await expect(page.getByLabel('Character 1 aliases', { exact: true })).toBeEnabled()
    else if (path === '/edit')
      await expect(page.getByRole('button', { name: 'Rename Character 1', exact: true })).toBeVisible()
    else
      await expect(page.getByRole('button', { name: path === '/create' ? 'Save commission' : 'Save suggestions', exact: true })).toBeEnabled()
    await page.addStyleTag({ content: 'html { font-size: 200%; }' })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280)
    const clippedActions = await page.locator('main button, main a').evaluateAll(elements => elements.filter(element => element instanceof HTMLElement && element.offsetWidth > 0 && element.scrollWidth > element.clientWidth + 1).map(element => element.textContent?.trim()))
    expect(clippedActions).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${path.slice(1) || 'overview'}-text-200.png`), fullPage: true })
  }
})

test('character cancellation and archive roundtrip keep visible status', async ({ page }) => {
  const width = 320
  const control = await mockApi(page)
  await page.route('**/api/admin/characters/order', async (route) => {
    const body = route.request().postDataJSON() as { active: number[], archived: number[] }
    control.mutations.push({ path: '/characters/order', body })
    // 成功写入必须影响后续 bootstrap，不能返回永远未归档的旧 fixture。
    control.archivedCharacter = body.archived.includes(2)
    await route.fulfill({ json: { status: 'success', message: 'Order saved.' } })
  })
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/edit')
  const firstCharacter = page.locator('[data-character-id="1"]')
  const secondCharacter = page.locator('[data-character-id="2"]')
  const firstStatus = firstCharacter.locator('[data-character-status-label]')
  const secondStatus = secondCharacter.locator('[data-character-status-label]')
  const firstStatusIcon = firstCharacter.locator('[data-character-status-icon]')
  const secondStatusIcon = secondCharacter.locator('[data-character-status-icon]')
  await expect(firstStatus).toHaveText('Active')
  await expect(firstStatusIcon).toHaveCount(0)
  await expect(firstCharacter.locator('button[aria-expanded]')).toHaveAccessibleDescription('Active')
  await expect(secondStatus).toHaveText('Active')
  await expect(secondStatusIcon).toHaveCount(0)
  await page.getByRole('button', { name: 'Rename Character 1', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Name for Character 1', exact: true })
  await input.fill('Cancelled name')
  await expect(input).toHaveAccessibleDescription('Active')
  await expect(firstStatus).toHaveText('Active')
  await page.getByRole('button', { name: 'Cancel renaming Character 1', exact: true }).click()
  await expect(input).toHaveCount(0)
  expect(control.mutations).toHaveLength(0)
  await page.getByRole('button', { name: 'Enter reorder mode' }).click()
  const move = page.getByRole('button', { name: 'Move Character 2 down', exact: true })
  await move.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => control.mutations.length).toBe(1)
  expect(control.mutations[0].body).toEqual({ active: [1], archived: [2] })
  await expect.poll(() => control.bootstrapRequests).toBe(2)
  await expect(page.locator('[data-character-id="2"]')).toHaveAttribute('data-character-status', 'archived')
  await expect(secondStatus).toHaveText('Archived')
  await expect(secondStatusIcon).toBeVisible()
  await expect(secondStatusIcon).toHaveAccessibleName('Archived')
  await expect(secondCharacter.locator('button[aria-expanded]')).toHaveAccessibleDescription('Archived')
  await expect(page.locator('[data-stale-divider]')).toHaveText('Archived (1)')
  const restore = page.getByRole('button', { name: 'Move Character 2 up', exact: true })
  await restore.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => control.mutations.length).toBe(2)
  expect(control.mutations[1].body).toEqual({ active: [1, 2], archived: [] })
  await expect.poll(() => control.bootstrapRequests).toBe(3)
  await expect(secondCharacter).toHaveAttribute('data-character-status', 'active')
  await expect(secondStatus).toHaveText('Active')
  await expect(secondStatusIcon).toHaveCount(0)
  await expect(page.locator('[data-stale-divider]')).toHaveText('Archived (0)')
})

test('archived status icon stays visible with long names and doubled mobile text', async ({ page }, testInfo) => {
  const colorScheme = 'dark'
  const control = await mockApi(page)
  control.archivedCharacter = true
  control.secondCharacterName = 'A very long archived character name '.repeat(5)
  await page.setViewportSize({ width: 320, height: 1000 })
  await page.emulateMedia({ colorScheme })
  await page.goto('/edit')
  await waitForMaintenanceReady(page, '/edit')
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await page.evaluate(() => document.fonts.ready)
  const character = page.locator('[data-character-id="2"]')
  const status = character.locator('[data-character-status-label]')
  const statusIcon = character.locator('[data-character-status-icon]')
  await expect(character).toHaveAttribute('data-character-status', 'archived')
  await expect(status).toHaveText('Archived')
  await expect(statusIcon).toBeVisible()
  await expect(statusIcon).toHaveAccessibleName('Archived')
  await expect(character.locator('button[aria-expanded]')).toHaveAccessibleDescription('Archived')
  await statusIcon.scrollIntoViewIfNeeded()
  const geometry = await character.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const statusElement = element.querySelector<SVGSVGElement>('[data-character-status-icon]')!
    const statusBounds = statusElement.getBoundingClientRect()
    const actions = [...element.querySelectorAll<HTMLElement>('button[aria-label]')].filter(button => button.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).map((button) => {
      const { left, right, width, height } = button.getBoundingClientRect()
      return { label: button.getAttribute('aria-label'), left, right, width, height, clipped: button.scrollWidth > button.clientWidth + 1 }
    })
    const clippedAncestors = []
    for (let ancestor = statusElement.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      const rect = ancestor.getBoundingClientRect()
      if (/hidden|clip/.test(style.overflowX) && (statusBounds.left < rect.left - 1 || statusBounds.right > rect.right + 1))
        clippedAncestors.push(ancestor.tagName)
      if (/hidden|clip/.test(style.overflowY) && (statusBounds.top < rect.top - 1 || statusBounds.bottom > rect.bottom + 1))
        clippedAncestors.push(ancestor.tagName)
    }
    const overflow = [...document.querySelectorAll('body *')].filter(node => node instanceof HTMLElement && node.checkVisibility() && node.getBoundingClientRect().right > innerWidth + 1).map(node => ({ tag: node.tagName, text: node.textContent?.trim().slice(0, 50), className: node.className, right: node.getBoundingClientRect().right }))
    return { documentWidth: document.documentElement.scrollWidth, overflow, bounds: { left: bounds.left, right: bounds.right }, status: { left: statusBounds.left, right: statusBounds.right, clipped: statusElement.scrollWidth > statusElement.clientWidth + 1 }, actions, clippedAncestors }
  })
  await testInfo.attach('停更状态与操作控件几何', { body: Buffer.from(JSON.stringify(geometry, null, 2)), contentType: 'application/json' })
  expect(geometry.documentWidth, JSON.stringify(geometry.overflow)).toBe(320)
  expect(geometry.status.left).toBeGreaterThanOrEqual(geometry.bounds.left)
  expect(geometry.status.right).toBeLessThanOrEqual(geometry.bounds.right)
  expect(geometry.status.clipped).toBe(false)
  expect(geometry.clippedAncestors).toEqual([])
  expect(geometry.actions).toHaveLength(2)
  for (const action of geometry.actions) {
    expect(action.width, action.label!).toBeGreaterThanOrEqual(44)
    expect(action.height, action.label!).toBeGreaterThanOrEqual(44)
    expect(action.left, action.label!).toBeGreaterThanOrEqual(geometry.bounds.left)
    expect(action.right, action.label!).toBeLessThanOrEqual(geometry.bounds.right)
    expect(action.clipped, action.label!).toBe(false)
  }
  await page.screenshot({ path: testInfo.outputPath(`archived-status-320-text-200-${colorScheme}.png`), fullPage: true })
})

test('desktop pointer drag still changes featured keyword order', async ({ page }) => {
  await mockApi(page)
  await page.goto('/suggestion')
  const list = page.getByRole('list', { name: 'Featured keyword order' })
  await page.getByRole('button', { name: 'Drag Winter', exact: true }).dragTo(page.getByRole('button', { name: 'Drag Summer', exact: true }))
  await expect(list.getByRole('listitem').first()).toContainText('Winter')
})

test('overview keeps primary actions stable and queues publishing once', async ({ page }, testInfo) => {
  const control = await mockApi(page)
  const gate = deferred()
  control.bootstrapGate = gate.promise
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  const rebuild = page.getByRole('button', { name: 'Rebuild website', exact: true })
  await expect(rebuild).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const before = await rebuild.boundingBox()
  await expect(page.getByText('No commissions', { exact: false })).toHaveCount(0)
  gate.resolve()
  await expect(page.getByRole('region', { name: 'Collection summary' })).toHaveAttribute('aria-busy', 'false')
  expect(await rebuild.boundingBox()).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  const publishing = deferred()
  control.rebuildGate = publishing.promise
  await rebuild.click()
  await expect(page.getByRole('button', { name: 'Queueing…' })).toBeDisabled()
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dispatching…' })).toBeDisabled()
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Queueing…' })).toBeDisabled()
  expect(control.rebuildRequests).toBe(1)
  publishing.resolve()
  await expect(page.getByText('Website rebuild queued.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await page.screenshot({ path: testInfo.outputPath('overview-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true })
})

test('suggestion preserves editor geometry, ordering and manual additions', async ({ page }, testInfo) => {
  const control = await mockApi(page)
  const gate = deferred()
  control.suggestionGate = gate.promise
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/suggestion')
  const save = page.getByRole('button', { name: 'Save suggestions', exact: true })
  await expect(save).toBeDisabled()
  await page.evaluate(() => document.fonts.ready)
  const before = await relativeBox(save)
  gate.resolve()
  await expect(save).toBeEnabled()
  expect(await relativeBox(save)).toEqual(before)
  await page.getByRole('button', { name: 'Move Winter up', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Featured keyword order' }).getByRole('listitem').first()).toContainText('Winter')
  await page.getByRole('textbox', { name: 'Add a keyword', exact: true }).fill('Custom keyword')
  await page.getByRole('textbox', { name: 'Add a keyword', exact: true }).press('Enter')
  expect(control.mutations).toHaveLength(0)
  await expect(page.getByRole('button', { name: 'Remove Custom keyword' })).toBeVisible()
  expect(await relativeBox(save)).toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await save.click()
  await expect.poll(() => control.mutations.length).toBe(1)
  expect(control.mutations[0].body).toEqual({ keywords: ['Winter', 'Summer', 'Custom keyword'] })
  const notices = page.locator('[data-notice-viewport="page"] > [role="status"]')
  await expect(notices).toHaveCount(2)
  const noticeBoxes = await notices.evaluateAll(elements => elements.map((element) => {
    const box = element.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom }
  }))
  expect(noticeBoxes[1].top - noticeBoxes[0].bottom).toBeGreaterThanOrEqual(7)
  await page.screenshot({ path: testInfo.outputPath('suggestion-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('suggestion-desktop.png'), fullPage: true })
})

test('alias tabs retain drafts, all creator aliases and explicit clearing', async ({ page }, testInfo) => {
  const control = await mockApi(page)
  const gate = deferred()
  control.aliasesGate = gate.promise
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/aliases')
  const filter = page.getByRole('searchbox', { name: 'Filter character aliases' })
  await expect(filter).toBeDisabled()
  await page.evaluate(() => document.fonts.ready)
  const before = await filter.boundingBox()
  gate.resolve()
  await expect(filter).toBeEnabled()
  expect(await filter.boundingBox()).toEqual(before)
  await page.getByRole('textbox', { name: 'Character 1 aliases', exact: true }).fill('My draft')
  await page.getByRole('tab', { name: 'Creator' }).click()
  await expect(page.getByRole('textbox', { name: '七市 aliases', exact: true })).toHaveValue('Nanashi, Nana')
  await page.getByRole('tab', { name: 'Keyword' }).click()
  await page.getByRole('textbox', { name: 'studio aliases', exact: true }).fill('')
  await page.getByRole('tab', { name: 'Character' }).click()
  await expect(page.getByRole('textbox', { name: 'Character 1 aliases', exact: true })).toHaveValue('My draft')
  await page.getByRole('tab', { name: 'Keyword' }).click()
  await expect(page.getByRole('textbox', { name: 'studio aliases', exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Save keyword aliases', exact: true }).click()
  await expect.poll(() => control.mutations.length).toBe(1)
  expect(control.mutations[0].body).toEqual({ rows: [{ baseKeyword: 'studio', aliases: '' }] })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.screenshot({ path: testInfo.outputPath('aliases-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('aliases-desktop.png'), fullPage: true })
})

test('keyword workspace keeps input and action anchors stable as preview and errors change', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/edit')
  await expect(page.locator('[data-character-section]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Replace keywords', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Replace keywords', exact: true })
  const find = dialog.getByRole('textbox', { name: 'Find', exact: true })
  const save = dialog.getByRole('button', { name: 'Replace all', exact: true })
  await page.evaluate(() => document.fonts.ready)
  const before = await Promise.all([find, save].map(locator => locator.boundingBox()))
  await find.fill('studio')
  await dialog.getByRole('textbox', { name: 'Replace with', exact: true }).fill('atelier')
  await expect(dialog.getByRole('region', { name: 'Replacement preview' })).toContainText('studio')
  expect(await Promise.all([find, save].map(locator => locator.boundingBox()))).toEqual(before)
  await save.click()
  await expect(dialog.getByRole('button', { name: 'Dismiss notification' })).toBeVisible()
  expect(await Promise.all([find, save].map(locator => locator.boundingBox()))).toEqual(before)
  expect(await dialog.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(320)
  await dialog.getByRole('button', { name: 'Dismiss notification' }).click()
  await page.screenshot({ path: testInfo.outputPath('keyword-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('keyword-desktop.png'), fullPage: true })
})

for (const scenario of [{ width: 1280, textScale: 100 }, { width: 320, textScale: 200 }]) {
  test(`cold character headers preserve geometry at ${scenario.width}px with ${scenario.textScale}% text`, async ({ page }, testInfo) => {
    const control = await mockApi(page)
    const gate = deferred()
    control.bootstrapGate = gate.promise
    await page.setViewportSize({ width: scenario.width, height: 1000 })
    await page.goto('/edit')
    if (scenario.textScale === 200)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' })
    const skeleton = page.locator('[data-character-skeleton]').first()
    await expect(skeleton).toBeVisible()
    await expect(page.locator('[data-character-skeleton]')).toHaveCount(4)
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
    })
    const before = await skeleton.boundingBox()
    expect(before).not.toBeNull()
    await page.screenshot({ path: testInfo.outputPath('character-header-loading.png'), fullPage: true })
    gate.resolve()
    await waitForMaintenanceReady(page, '/edit')
    const character = page.locator('[data-character-id="1"]')
    await expect(character.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('[data-character-skeleton]')).toHaveCount(0)
    const after = await character.boundingBox()
    expect(after).not.toBeNull()
    expect(Math.abs(after!.height - before!.height), '冷加载角色占位与折叠角色头部须等高').toBeLessThanOrEqual(1)
    expect(Math.abs(after!.width - before!.width), '冷加载角色占位与角色卡片须等宽').toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(scenario.width)
    await writeFile(testInfo.outputPath('character-header-geometry.json'), `${JSON.stringify({ scenario, before, after }, null, 2)}\n`)
    await testInfo.attach('角色头冷加载前后几何', { body: Buffer.from(JSON.stringify({ scenario, before, after }, null, 2)), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath('character-header-ready.png'), fullPage: true })
  })
}

for (const { width, count } of [{ width: 320, count: 0 }, { width: 768, count: 7 }, { width: 2560, count: 30 }]) {
  test(`character grid preserves height for ${count} entries at ${width}px`, async ({ page }) => {
    const control = await mockApi(page, count)
    const gate = deferred()
    control.characterGate = gate.promise
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/edit')
    await page.evaluate(() => document.fonts.ready)
    const first = page.locator('[data-character-section]').first()
    const following = page.locator('[data-character-section]').nth(1)
    await first.locator('button[aria-expanded]').click()
    await expect.poll(() => control.characterRequests).toBe(1)
    const y = await following.evaluate(element => element.getBoundingClientRect().y + window.scrollY)
    gate.resolve()
    await expect(first.locator('[id$="-panel"]')).toHaveAttribute('aria-busy', 'false')
    await expect(first.locator('[data-commission-id]')).toHaveCount(count)
    const finalY = await following.evaluate(element => element.getBoundingClientRect().y + window.scrollY)
    expect(finalY).toBeCloseTo(y, 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}
