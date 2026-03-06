// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from './hamburgerMenuStateEvent'
import { mountMobileLanguageMenu } from './mobileLanguageMenu'

const renderMenu = () => {
  document.body.innerHTML = `
    <div data-mobile-hamburger="true" data-mobile-hamburger-mounted="false"></div>
    <div data-mobile-language-menu-root="true" class="opacity-100">
      <div data-mobile-language-menu-anchor="true" class="pointer-events-auto">
        <details data-mobile-language-menu="true">
          <summary>Language</summary>
          <ul><li><a href="/">English</a></li></ul>
        </details>
      </div>
    </div>
  `
}

const getRoot = () => document.querySelector<HTMLElement>('[data-mobile-language-menu-root="true"]')
const getAnchor = () =>
  document.querySelector<HTMLElement>('[data-mobile-language-menu-anchor="true"]')
const getMenu = () =>
  document.querySelector<HTMLDetailsElement>('[data-mobile-language-menu="true"]')

describe('mobileLanguageMenu', () => {
  beforeEach(() => {
    renderMenu()
  })

  it('hides and closes language menu while hamburger is mounted', () => {
    const cleanup = mountMobileLanguageMenu()
    const root = getRoot()
    const anchor = getAnchor()
    const menu = getMenu()

    menu!.open = true
    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, { detail: { mounted: true } }),
    )

    expect(root?.classList.contains('opacity-0')).toBe(true)
    expect(anchor?.classList.contains('pointer-events-none')).toBe(true)
    expect(menu?.open).toBe(false)

    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, { detail: { mounted: false } }),
    )

    expect(root?.classList.contains('opacity-100')).toBe(true)
    expect(anchor?.classList.contains('pointer-events-auto')).toBe(true)

    cleanup()
  })

  it('closes the menu when clicking outside or pressing Escape', () => {
    const cleanup = mountMobileLanguageMenu()
    const menu = getMenu()

    menu!.open = true
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(menu?.open).toBe(false)

    menu!.open = true
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(menu?.open).toBe(false)

    cleanup()
  })

  it('removes listeners on cleanup', () => {
    const cleanup = mountMobileLanguageMenu()
    const anchor = getAnchor()

    cleanup()
    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, { detail: { mounted: true } }),
    )

    expect(anchor?.classList.contains('pointer-events-none')).toBe(false)
  })
})
