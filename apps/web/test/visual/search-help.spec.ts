import { expect, test } from '@playwright/test'
import { expectFixtureData } from './fixtureGuard'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hasConfirmedAge', String(Date.now()))
  })
})

const scenarios = [
  { name: 'desktop English', path: '/', width: 1440, height: 1000 },
  { name: 'mobile Chinese', path: '/zh-tw/', width: 390, height: 844 },
  { name: 'narrow Japanese', path: '/ja/', width: 320, height: 568 },
  { name: 'short viewport', path: '/', width: 640, height: 320 },
]

for (const scenario of scenarios) {
  test(`help stays anchored and usable on ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.goto(scenario.path)
    await expectFixtureData(page)
    const trigger = page.locator('#search-help-trigger')
    const popover = page.locator('#search-help-popover')
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    await expect(popover).toBeVisible()
    await expect.poll(() => popover.evaluate(el => el.getAnimations().length)).toBe(0)

    const triggerBox = await trigger.boundingBox()
    const panelBox = await popover.boundingBox()
    expect(triggerBox).not.toBeNull()
    expect(panelBox).not.toBeNull()
    if (!triggerBox || !panelBox)
      return

    expect(panelBox.x).toBeGreaterThanOrEqual(7)
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(scenario.width - 7)
    expect(panelBox.y).toBeGreaterThanOrEqual(7)
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(scenario.height - 7)
    const gapBelow = panelBox.y - (triggerBox.y + triggerBox.height)
    const gapAbove = triggerBox.y - (panelBox.y + panelBox.height)
    expect(Math.min(Math.abs(gapBelow - 8), Math.abs(gapAbove - 8))).toBeLessThan(1)
    expect(await popover.evaluate(el => Number.parseFloat(getComputedStyle(el).borderRadius)))
      .toBeGreaterThan(0)

    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await popover.getByRole('button').click()
    await expect(popover).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await page.mouse.click(1, 1)
    await expect(popover).toBeHidden()
  })
}

test('help animates both opening and closing in the top layer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expectFixtureData(page)
  await page.locator('#search-help-trigger').scrollIntoViewIfNeeded()

  const opening = await page.evaluate(async () => {
    const trigger = document.querySelector<HTMLButtonElement>('#search-help-trigger')!
    const panel = document.querySelector<HTMLElement>('#search-help-popover')!
    trigger.click()
    await new Promise(requestAnimationFrame)
    return {
      opacity: Number(getComputedStyle(panel).opacity),
      animations: panel.getAnimations().length,
    }
  })
  expect(opening.animations).toBeGreaterThan(0)
  expect(opening.opacity).toBeLessThan(1)
  const popover = page.locator('#search-help-popover')
  await expect.poll(() => popover.evaluate(el => el.getAnimations().length)).toBe(0)

  const closing = await popover.evaluate(async (panel) => {
    ;(panel as HTMLElement).hidePopover()
    await new Promise(requestAnimationFrame)
    return {
      open: panel.matches(':popover-open'),
      display: getComputedStyle(panel).display,
      animations: panel.getAnimations().length,
    }
  })
  expect(closing.open).toBe(false)
  expect(closing.display).not.toBe('none')
  expect(closing.animations).toBeGreaterThan(0)
  await expect(popover).toBeHidden()
})

test('help remains usable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expectFixtureData(page)
  const trigger = page.locator('#search-help-trigger')
  const popover = page.locator('#search-help-popover')
  await trigger.click()
  await expect(popover).toBeVisible()
  expect(await popover.evaluate(el => Number.parseFloat(getComputedStyle(el).transitionDuration)))
    .toBeLessThan(0.001)
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
})
