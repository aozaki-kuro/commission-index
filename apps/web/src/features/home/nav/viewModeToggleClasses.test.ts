import type { ViewModeToggleClassTable } from './viewModeToggleClasses'
// @vitest-environment jsdom
import { mountMobileViewModeTabs } from '@features/home/commission/mobileViewModeTabs'
import { beforeEach, describe, expect, it } from 'vitest'
import { mountMobileHamburgerMenu } from './hamburger/mobileHamburgerMenu'
import { mountSidebarNavEnhancer } from './sidebarNavEnhancer'
import {
  applyViewModeToggleClasses,
  HAMBURGER_VIEW_MODE_TOGGLE_CLASSES,
  MOBILE_VIEW_MODE_TAB_CLASSES,
  SIDEBAR_VIEW_MODE_TOGGLE_CLASSES,
} from './viewModeToggleClasses'

// Server markup ships the character view: its button active, the timeline one inactive.
function toggleMarkup(attribute: string, indicatorAttribute: string, table: ViewModeToggleClassTable) {
  const button = (mode: string, active: boolean) => `
    <button ${attribute}="true" data-view-mode="${mode}" class="${(active ? table.activeTextClasses : table.inactiveTextClasses).join(' ')}">
      <svg ${indicatorAttribute} class="${(active ? table.activeIndicatorClasses : table.inactiveIndicatorClasses).join(' ')}"></svg>
    </button>`
  return `${button('character', true)}${button('timeline', false)}`
}

// What the inline pre-paint script does for `?view=timeline`, driven by the same table.
function prePaintTimeline(table: ViewModeToggleClassTable) {
  document.querySelectorAll<HTMLElement>(table.toggleSelector).forEach((button) => {
    applyViewModeToggleClasses(button, table, button.dataset.viewMode === 'timeline')
  })
}

function indicatorClasses(table: ViewModeToggleClassTable, mode: string) {
  const button = document.querySelector(`${table.toggleSelector}[data-view-mode="${mode}"]`)
  return [
    ...(button?.querySelector(table.indicatorSelector)?.classList ?? []),
  ].toSorted()
}

describe('view-mode toggle class tables', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?view=timeline')
  })

  it('mobile tabs: a timeline pre-paint followed by a switch back restores the server markup classes', () => {
    document.body.innerHTML = `<div data-mobile-view-tabs="true">${toggleMarkup('data-mobile-view-mode-toggle', 'data-mobile-view-mode-indicator', MOBILE_VIEW_MODE_TAB_CLASSES)}</div>`
    const serverCharacterClasses = indicatorClasses(MOBILE_VIEW_MODE_TAB_CLASSES, 'character')

    prePaintTimeline(MOBILE_VIEW_MODE_TAB_CLASSES)
    const dispose = mountMobileViewModeTabs()
    expect(indicatorClasses(MOBILE_VIEW_MODE_TAB_CLASSES, 'timeline')).toEqual([...MOBILE_VIEW_MODE_TAB_CLASSES.activeIndicatorClasses].toSorted())

    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(indicatorClasses(MOBILE_VIEW_MODE_TAB_CLASSES, 'character')).toEqual(serverCharacterClasses)
    dispose()
  })

  it('mount code toggles exactly the tables the pre-paint script receives', () => {
    document.body.innerHTML = `
      <div data-mobile-view-tabs="true">${toggleMarkup('data-mobile-view-mode-toggle', 'data-mobile-view-mode-indicator', MOBILE_VIEW_MODE_TAB_CLASSES)}</div>
      <nav id="Character List">${toggleMarkup('data-sidebar-view-mode-toggle', 'data-sidebar-view-mode-indicator', SIDEBAR_VIEW_MODE_TOGGLE_CLASSES)}</nav>
      <div data-mobile-hamburger="true">
        <button data-mobile-hamburger-toggle="true"><span data-mobile-hamburger-toggle-label></span></button>
        <button data-mobile-hamburger-backdrop="true"></button>
        <div data-mobile-hamburger-panel="true">
          <button data-mobile-hamburger-search-action="true"></button>
          ${toggleMarkup('data-mobile-hamburger-view-mode-toggle', 'data-mobile-hamburger-view-mode-indicator', HAMBURGER_VIEW_MODE_TOGGLE_CLASSES)}
          <div data-mobile-nav-root="true"></div>
        </div>
      </div>`
    const disposers = [
      mountMobileViewModeTabs(),
      mountMobileHamburgerMenu(),
      mountSidebarNavEnhancer(),
    ]

    for (const table of [MOBILE_VIEW_MODE_TAB_CLASSES, HAMBURGER_VIEW_MODE_TOGGLE_CLASSES, SIDEBAR_VIEW_MODE_TOGGLE_CLASSES]) {
      const timeline = document.querySelector<HTMLElement>(`${table.toggleSelector}[data-view-mode="timeline"]`)!
      const character = document.querySelector<HTMLElement>(`${table.toggleSelector}[data-view-mode="character"]`)!
      expect([...timeline.classList].toSorted(), table.toggleSelector).toEqual([...table.activeTextClasses].toSorted())
      expect([...character.classList].toSorted(), table.toggleSelector).toEqual([...table.inactiveTextClasses].toSorted())
      expect(indicatorClasses(table, 'timeline'), table.toggleSelector).toEqual([...table.activeIndicatorClasses].toSorted())
      expect(indicatorClasses(table, 'character'), table.toggleSelector).toEqual([...table.inactiveIndicatorClasses].toSorted())
    }
    disposers.forEach(dispose => dispose())
  })
})
