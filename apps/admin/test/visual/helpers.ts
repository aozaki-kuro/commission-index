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

export function skipUnlessProject(testInfo: TestInfo, projectName: string) {
  test.skip(testInfo.project.name !== projectName, `Runs only in the ${projectName} project.`)
}

export function getAdminPageContainer(page: Page) {
  return page.locator('div.mx-auto.max-w-5xl.space-y-6.px-4.pt-6.pb-10').first()
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
