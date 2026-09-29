import type { Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
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
      const characters = commissions.map(row => ({ id: row.characterId, name: row.characterName, status: 'active', sortOrder: row.id, commissionCount: row.id === 1 ? firstCharacterCount : 1 }))
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
  await page.getByRole('combobox', { name: 'Search commissions' }).fill('Character 2')
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

test('mobile image crop retains rotation and the fixed JPEG output contract', async ({ page }) => {
  await mockApi(page)
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
  await expect(page.getByRole('button', { name: 'Save commission' })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Delivery date' })).toHaveValue('2026-09-29')
  await expect(page.getByRole('textbox', { name: 'Creator (optional)' })).toHaveValue('Artist')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
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

for (const width of [320, 768, 1280]) {
  for (const count of [0, 6, 7, 30]) {
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
}
