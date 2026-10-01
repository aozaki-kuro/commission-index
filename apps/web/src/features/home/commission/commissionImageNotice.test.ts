// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCommissionImageNoticeClient } from './commissionImageNoticeClient'

describe('commissionImageNotice', () => {
  let cleanupNotice: (() => void) | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    cleanupNotice = null
  })

  afterEach(() => {
    cleanupNotice?.()
  })

  it('keeps contextmenu behavior and renders notice text', async () => {
    cleanupNotice = mountCommissionImageNoticeClient()

    const container = document.createElement('div')
    container.setAttribute('data-commission-image', 'true')
    container.setAttribute('data-commission-alt', 'sample alt text')
    const child = document.createElement('span')
    container.appendChild(child)
    document.body.appendChild(container)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 80,
      clientY: 120,
    })
    child.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)

    await vi.waitFor(() => {
      const notice = document.querySelector<HTMLElement>('[data-commission-image-notice="true"]')
      expect(notice?.textContent).toBe('sample alt text')
    })
  })
})
