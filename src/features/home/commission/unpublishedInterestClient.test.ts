// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountUnpublishedInterestButtons } from './unpublishedInterestClient'

function buildButtonMarkup(commissionKey = 'artoria-pendragon-20240203') {
  return `
  <button
    type="button"
    aria-pressed="false"
    data-link-style="true"
    title="Record interest in this unpublished commission"
    data-commission-interest-key="${commissionKey}"
    data-commission-interest-recorded-label="Recorded"
    data-commission-interest-recorded-title="Already recorded"
  >
    <span aria-hidden="true"></span>
    <span data-commission-interest-label>Want this</span>
  </button>
`
}

describe('unpublishedInterestClient', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('records interest once, persists state, and disables the button', () => {
    const trackEvent = vi.fn()
    document.body.innerHTML = buildButtonMarkup()

    const cleanup = mountUnpublishedInterestButtons({ trackEvent })
    const button = document.querySelector<HTMLButtonElement>('[data-commission-interest-key]')

    button?.click()

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({ sub_event: 'artoria-pendragon-20240203' })
    expect(button).toBeDisabled()
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    expect(button?.title).toBe('Already recorded')
    expect(button?.dataset.linkStyle).toBeUndefined()
    expect(button?.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')
    expect(
      localStorage.getItem('commission-index:unpublished-interest:artoria-pendragon-20240203'),
    ).toBe('1')

    button?.click()
    expect(trackEvent).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('hydrates persisted interest state on mount', () => {
    localStorage.setItem('commission-index:unpublished-interest:artoria-pendragon-20240203', '1')
    document.body.innerHTML = buildButtonMarkup()

    const cleanup = mountUnpublishedInterestButtons()
    const button = document.querySelector<HTMLButtonElement>('[data-commission-interest-key]')

    expect(button).toBeDisabled()
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    expect(button?.title).toBe('Already recorded')
    expect(button?.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')

    cleanup()
  })
})
