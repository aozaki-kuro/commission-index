// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { HAMBURGER_MENU_MOUNTED_CHANGE_EVENT } from './hamburgerMenuStateEvent'
import { mountMobileLanguageMenu } from './mobileLanguageMenu'

const renderMenu = () => {
  document.body.innerHTML = `
    <div data-mobile-hamburger="true" data-mobile-hamburger-mounted="false"></div>
    <div data-mobile-language-menu-root="true" class="opacity-100">
      <details data-mobile-language-menu="true">
        <summary>Language</summary>
        <ul><li><a href="/">English</a></li></ul>
      </details>
    </div>
  `
}

const getRoot = () => document.querySelector<HTMLElement>('[data-mobile-language-menu-root="true"]')
const getMenu = () =>
  document.querySelector<HTMLDetailsElement>('[data-mobile-language-menu="true"]')

describe('mobileLanguageMenu', () => {
  beforeEach(() => {
    renderMenu()
  })

  it('hides and closes language menu while hamburger is mounted', () => {
    const cleanup = mountMobileLanguageMenu()
    const root = getRoot()
    const menu = getMenu()

    menu!.open = true
    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, { detail: { mounted: true } }),
    )

    expect(root?.classList.contains('pointer-events-none')).toBe(true)
    expect(root?.classList.contains('opacity-0')).toBe(true)
    expect(menu?.open).toBe(false)

    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, { detail: { mounted: false } }),
    )

    expect(root?.classList.contains('pointer-events-none')).toBe(false)
    expect(root?.classList.contains('opacity-100')).toBe(true)

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
    const root = getRoot()

    cleanup()
    window.dispatchEvent(
      new CustomEvent(HAMBURGER_MENU_MOUNTED_CHANGE_EVENT, { detail: { mounted: true } }),
    )

    expect(root?.classList.contains('pointer-events-none')).toBe(false)
  })
})
