import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from '@features/home/events'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mountMobileKeywordButton } from './mobileKeywordButton'

function renderButton(mounted = false) {
  document.body.innerHTML = `
    <div data-mobile-hamburger="true" data-mobile-hamburger-mounted="${mounted}"></div>
    <div data-mobile-keyword-button-root="true" class="opacity-100">
      <div data-mobile-keyword-button-anchor="true" class="pointer-events-auto">
        <button type="button" popovertarget="search-browse-popover">Browse keywords</button>
      </div>
    </div>
  `
}

const getRoot = () => document.querySelector<HTMLElement>('[data-mobile-keyword-button-root="true"]')!
const getAnchor = () => document.querySelector<HTMLElement>('[data-mobile-keyword-button-anchor="true"]')!

function dispatchMounted(mounted: boolean) {
  window.dispatchEvent(new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, {
    detail: { mounted },
  }))
}

describe('mobileKeywordButton', () => {
  beforeEach(() => {
    renderButton()
  })

  it('hides while the hamburger is mounted and returns when it unmounts', () => {
    const cleanup = mountMobileKeywordButton()

    dispatchMounted(true)
    expect(getRoot().classList.contains('opacity-0')).toBe(true)
    expect(getAnchor().classList.contains('pointer-events-none')).toBe(true)

    dispatchMounted(false)
    expect(getRoot().classList.contains('opacity-100')).toBe(true)
    expect(getAnchor().classList.contains('pointer-events-auto')).toBe(true)

    cleanup()
  })

  it('starts hidden when the hamburger is already mounted', () => {
    renderButton(true)
    const cleanup = mountMobileKeywordButton()

    expect(getRoot().classList.contains('opacity-0')).toBe(true)

    cleanup()
  })

  it('removes listeners on cleanup', () => {
    const cleanup = mountMobileKeywordButton()

    cleanup()
    dispatchMounted(true)

    expect(getAnchor().classList.contains('pointer-events-none')).toBe(false)
  })
})
