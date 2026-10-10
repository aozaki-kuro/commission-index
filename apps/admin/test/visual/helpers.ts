import type { AdminAliasesData, AdminBootstrapData, AdminCommissionSearchRow, CommissionRow, HomeSuggestionAdminData } from '@commission-index/domain'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

export const ADMIN_PROJECT_NAME = 'admin'

export async function createTestSourceImage(
  page: Page,
  size = { height: 1000, width: 1600 },
) {
  const dataUrl = await page.evaluate(({ height, width }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Missing canvas context')
    }

    context.fillStyle = '#9d3757'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f7eef1'
    context.fillRect(width * 0.225, height * 0.22, width * 0.55, height * 0.56)
    context.fillStyle = '#171717'
    context.beginPath()
    context.arc(width / 2, height / 2, Math.min(width, height) * 0.18, 0, Math.PI * 2)
    context.fill()

    return canvas.toDataURL('image/png')
  }, size)

  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
}

export async function prepareStablePage(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `,
  })
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready
    }
  })
}

export async function rotateCropImage(page: Page, degrees: number) {
  const frame = page.locator('cropper-selection')
  const handle = page.getByRole('button', { name: 'Rotate image freely' })
  // The workspace lays out asynchronously: the handle is rendered from React state while
  // <cropper-selection> is still 0x0 until the image is fitted. Wait until both agree on the
  // same, non-empty selection, otherwise the gesture centre is computed from pre-layout geometry.
  await expect.poll(async () => {
    const frameBox = await frame.boundingBox()
    const handleBox = await handle.boundingBox()
    return Boolean(frameBox && handleBox && frameBox.width > 0
      && Math.abs(handleBox.x + handleBox.width / 2 - (frameBox.x + frameBox.width / 2)) < 1)
  }, { message: 'Crop frame and rotation handle did not agree on a laid-out selection' }).toBe(true)
  const frameBox = await frame.boundingBox()
  const handleBox = await handle.boundingBox()

  if (!frameBox || !handleBox) {
    throw new Error('Crop frame rotation controls did not render')
  }

  const center = {
    x: frameBox.x + frameBox.width / 2,
    y: frameBox.y + frameBox.height / 2,
  }
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  }
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const radius = Math.hypot(start.x - center.x, start.y - center.y)
  const endAngle = startAngle + degrees * Math.PI / 180

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(
    center.x + Math.cos(endAngle) * radius,
    center.y + Math.sin(endAngle) * radius,
    { steps: 8 },
  )
  await page.mouse.up()
}

export function skipUnlessProject(testInfo: TestInfo, projectName: string) {
  test.skip(testInfo.project.name !== projectName, `Runs only in the ${projectName} project.`)
}

export function getAdminPageContainer(page: Page) {
  return page.getByRole('heading', { level: 1 }).locator('..').locator('..')
}

async function getUnionClip(locators: Locator[]) {
  const boxes = (
    await Promise.all(
      locators.map(async (locator) => {
        await locator.scrollIntoViewIfNeeded()
        return locator.boundingBox()
      }),
    )
  ).filter((box): box is NonNullable<typeof box> => box !== null)

  if (boxes.length === 0) {
    throw new Error('No visible elements were found for screenshot clipping.')
  }

  const x = Math.min(...boxes.map(box => box.x))
  const y = Math.min(...boxes.map(box => box.y))
  const right = Math.max(...boxes.map(box => box.x + box.width))
  const bottom = Math.max(...boxes.map(box => box.y + box.height))
  const padding = 12

  return {
    x: Math.max(0, Math.floor(x - padding)),
    y: Math.max(0, Math.floor(y - padding)),
    width: Math.ceil(right - x + padding * 2),
    height: Math.ceil(bottom - y + padding * 2),
  }
}

export async function expectUnionToMatchSnapshot(
  page: Page,
  snapshotName: string,
  locators: Locator[],
) {
  const clip = await getUnionClip(locators)

  expect(
    await page.screenshot({
      clip,
      animations: 'disabled',
      caret: 'hide',
    }),
  ).toMatchSnapshot(snapshotName)
}

const fixtureCharacters: AdminBootstrapData['characters'] = [
  { id: 1, name: 'Aster', status: 'active', sortOrder: 1, commissionCount: 2 },
  { id: 2, name: 'Briar', status: 'active', sortOrder: 2, commissionCount: 1 },
]

const fixtureCommissions: CommissionRow[] = [
  {
    id: 1,
    publicId: '00000000-0000-4000-8000-000000000001',
    characterId: 1,
    characterName: 'Aster',
    commissionDate: '2026-09-29',
    creatorName: 'Nanashi',
    workGroupId: 'fixture-group',
    partNumber: 1,
    fileName: '20260929_Nanashi_Aster_1',
    links: ['https://example.com/work/1'],
    design: 'Summer outfit',
    description: 'Full body',
    keyword: 'Summer, Studio, Rain',
    hidden: false,
  },
  {
    id: 2,
    publicId: '00000000-0000-4000-8000-000000000002',
    characterId: 1,
    characterName: 'Aster',
    commissionDate: '2026-08-15',
    creatorName: 'Nanashi',
    workGroupId: 'fixture-group',
    partNumber: 2,
    fileName: '20260815_Nanashi_Aster_2',
    links: [],
    design: null,
    description: null,
    keyword: 'Summer, Winter',
    hidden: false,
  },
  {
    id: 3,
    publicId: '00000000-0000-4000-8000-000000000003',
    characterId: 2,
    characterName: 'Briar',
    commissionDate: '2026-07-01',
    creatorName: 'Kumo',
    workGroupId: null,
    partNumber: null,
    fileName: '20260701_Kumo_Briar',
    links: ['https://example.com/work/3'],
    design: 'Reference',
    description: null,
    keyword: 'Winter, Snow',
    hidden: false,
  },
]

const fixtureSearchRows: AdminCommissionSearchRow[] = fixtureCommissions.map(row => ({
  ...row,
  links: JSON.stringify(row.links),
}))

const fixtureBootstrap: AdminBootstrapData = {
  characters: fixtureCharacters,
  commissionSearchRows: fixtureSearchRows,
  creatorAliases: [
    { creatorName: 'Nanashi', commissionCount: 2, aliases: ['Nana'] },
    { creatorName: 'Kumo', commissionCount: 1, aliases: [] },
  ],
}

const fixtureAliases: AdminAliasesData = {
  characterAliases: [
    { characterName: 'Aster', commissionCount: 2, aliases: ['Asu'] },
    { characterName: 'Briar', commissionCount: 1, aliases: [] },
  ],
  creatorAliases: fixtureBootstrap.creatorAliases,
  keywordAliases: [{ baseKeyword: 'Summer', commissionCount: 2, aliases: ['Natsu'] }],
}

const fixtureSuggestion: HomeSuggestionAdminData = {
  featuredKeywords: ['Summer', 'Winter', 'Studio'],
  keywordOptions: ['Summer', 'Winter', 'Studio', 'Rain', 'Snow'],
}

const fixtureImageSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="525"><rect width="1280" height="525" fill="#d7dce0"/><circle cx="640" cy="262" r="150" fill="#a7b5ba"/></svg>'

export interface MockAdminApiCapture {
  /** Last POST to commissions/:id/source-image. */
  sourceImageBody: Buffer | null
  sourceImageContentType: string
}

/**
 * Answers every `/api/admin/**` request (plus the public site's build-info.json) from fixtures so admin
 * screenshot specs never reach a worker. Unknown non-GET -> 400, unknown GET -> 404.
 */
export async function mockAdminApi(page: Page): Promise<MockAdminApiCapture> {
  const capture: MockAdminApiCapture = { sourceImageBody: null, sourceImageContentType: '' }

  await page.route('**/build-info.json', async (route) => {
    // Fixed timestamps keep the sidebar build-version UI stable in screenshots.
    await route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { dataRevision: 'fixture', dataExportedAt: '2026-09-29T00:00:00.000Z', codeSha: null, builtAt: '2026-09-29T00:00:00.000Z' },
    })
  })

  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const pathname = new URL(request.url()).pathname

    if (/\/commissions\/[^/]+\/source-image(?:\/.*)?$/.test(pathname)) {
      if (method === 'GET') {
        await route.fulfill({ contentType: 'image/svg+xml', body: fixtureImageSvg })
        return
      }
      if (method === 'POST') {
        capture.sourceImageBody = request.postDataBuffer()
        capture.sourceImageContentType = request.headers()['content-type'] ?? ''
        await route.fulfill({ json: { status: 'success', message: 'Test source image replaced.' } })
        return
      }
    }
    if (method === 'GET') {
      const characterCommissions = /\/characters\/(\d+)\/commissions$/.exec(pathname)
      if (pathname.endsWith('/health')) {
        await route.fulfill({ json: { status: 'ok', message: 'Fixture connection ready.' } })
        return
      }
      if (pathname.endsWith('/aliases/bootstrap')) {
        await route.fulfill({ json: fixtureAliases })
        return
      }
      if (pathname.endsWith('/bootstrap')) {
        await route.fulfill({ json: fixtureBootstrap })
        return
      }
      if (pathname.endsWith('/suggestion')) {
        await route.fulfill({ json: fixtureSuggestion })
        return
      }
      if (characterCommissions) {
        const characterId = Number(characterCommissions[1])
        await route.fulfill({ json: { commissions: fixtureCommissions.filter(row => row.characterId === characterId) } })
        return
      }
      await route.fulfill({ status: 404, json: { message: 'Unexpected fixture API' } })
      return
    }
    await route.fulfill({ status: 400, json: { status: 'error', message: 'Unexpected fixture API mutation' } })
  })

  return capture
}
