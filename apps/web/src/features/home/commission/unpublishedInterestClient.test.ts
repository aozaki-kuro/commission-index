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
    <svg data-commission-interest-icon="default" aria-hidden="true" class="size-4 shrink-0"></svg>
    <svg data-commission-interest-icon="recorded" aria-hidden="true" class="hidden size-4 shrink-0"></svg>
    <span data-commission-interest-label>Want this</span>
  </button>
`
}

function expectInterestIconState(
  button: HTMLButtonElement | null,
  { defaultHidden, recordedHidden }: { defaultHidden: boolean, recordedHidden: boolean },
) {
  expect(
    button?.querySelector('[data-commission-interest-icon="default"]')?.classList.contains('hidden'),
  ).toBe(defaultHidden)
  expect(
    button?.querySelector('[data-commission-interest-icon="recorded"]')?.classList.contains('hidden'),
  ).toBe(recordedHidden)
}

describe('unpublishedInterestClient', () => {
  let storage: Storage

  beforeEach(() => {
    storage = window.localStorage
    storage.clear()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('records interest once, persists state, and disables the button', () => {
    const trackEvent = vi.fn()
    document.body.innerHTML = buildButtonMarkup()

    const cleanup = mountUnpublishedInterestButtons({ trackEvent })
    const button = document.querySelector<HTMLButtonElement>('[data-commission-interest-key]')

    expectInterestIconState(button, { defaultHidden: false, recordedHidden: true })

    button?.click()

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({ sub_event: 'artoria-pendragon-20240203' })
    expect(button?.disabled).toBe(true)
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    expect(button?.title).toBe('Already recorded')
    expect(button?.dataset.linkStyle).toBeUndefined()
    expect(button?.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')
    expectInterestIconState(button, { defaultHidden: true, recordedHidden: false })
    expect(
      storage.getItem('commission-index:unpublished-interest:artoria-pendragon-20240203'),
    ).toBe('1')

    button?.click()
    expect(trackEvent).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('hydrates persisted interest state on mount', () => {
    storage.setItem('commission-index:unpublished-interest:artoria-pendragon-20240203', '1')
    document.body.innerHTML = buildButtonMarkup()

    const cleanup = mountUnpublishedInterestButtons()
    const button = document.querySelector<HTMLButtonElement>('[data-commission-interest-key]')

    expect(button?.disabled).toBe(true)
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    expect(button?.title).toBe('Already recorded')
    expect(button?.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')
    expectInterestIconState(button, { defaultHidden: true, recordedHidden: false })

    cleanup()
  })

  it('handles buttons appended after mount', () => {
    const trackEvent = vi.fn()
    const cleanup = mountUnpublishedInterestButtons({ trackEvent })
    const wrapper = document.createElement('div')
    wrapper.innerHTML = buildButtonMarkup('mash-kyrielight-20240311')
    const button = wrapper.querySelector<HTMLButtonElement>('[data-commission-interest-key]')
    if (!button)
      throw new Error('expected interest button')
    document.body.append(button)

    button.click()

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({ sub_event: 'mash-kyrielight-20240311' })
    expect(button?.disabled).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')
    expectInterestIconState(button, { defaultHidden: true, recordedHidden: false })
    expect(storage.getItem('commission-index:unpublished-interest:mash-kyrielight-20240311')).toBe('1')

    cleanup()
  })

  it('syncs all buttons that share the same interest key', () => {
    const trackEvent = vi.fn()
    document.body.innerHTML = `
      <section data-view-mode="date">${buildButtonMarkup('shared-20240315')}</section>
      <section data-view-mode="character">${buildButtonMarkup('shared-20240315')}</section>
    `

    const cleanup = mountUnpublishedInterestButtons({ trackEvent })
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-commission-interest-key]')]
    const [dateButton, characterButton] = buttons

    if (!dateButton || !characterButton)
      throw new Error('expected both interest buttons')

    dateButton.click()

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({ sub_event: 'shared-20240315' })

    for (const button of buttons) {
      expect(button?.disabled).toBe(true)
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.title).toBe('Already recorded')
      expect(button.dataset.linkStyle).toBeUndefined()
      expect(button.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')
      expectInterestIconState(button, { defaultHidden: true, recordedHidden: false })
    }

    expect(storage.getItem('commission-index:unpublished-interest:shared-20240315')).toBe('1')

    cleanup()
  })

  it('hydrates deferred buttons appended after the interest was already recorded', async () => {
    const trackEvent = vi.fn()
    document.body.innerHTML = `<section data-view-mode="date">${buildButtonMarkup('deferred-20240316')}</section>`

    const cleanup = mountUnpublishedInterestButtons({ trackEvent })
    const dateButton = document.querySelector<HTMLButtonElement>('[data-commission-interest-key]')
    if (!dateButton)
      throw new Error('expected initial interest button')

    dateButton.click()

    const wrapper = document.createElement('div')
    wrapper.innerHTML = `<section data-view-mode="character">${buildButtonMarkup('deferred-20240316')}</section>`
    document.body.append(wrapper)

    await Promise.resolve()

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-commission-interest-key]')]
    const deferredButton = buttons.at(-1)
    if (!deferredButton)
      throw new Error('expected deferred interest button')

    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith({ sub_event: 'deferred-20240316' })
    expect(deferredButton.disabled).toBe(true)
    expect(deferredButton.getAttribute('aria-pressed')).toBe('true')
    expect(deferredButton.title).toBe('Already recorded')
    expect(deferredButton.dataset.linkStyle).toBeUndefined()
    expect(deferredButton.querySelector('[data-commission-interest-label]')?.textContent).toBe('Recorded')
    expectInterestIconState(deferredButton, { defaultHidden: true, recordedHidden: false })

    cleanup()
  })
})
