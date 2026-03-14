import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mountMobileViewModeTabs } from './mobileViewModeTabs'

function renderMobileTabsRoot() {
  document.body.innerHTML = `
    <div data-mobile-view-tabs="true">
      <button
        type="button"
        data-mobile-view-mode-toggle="true"
        data-view-mode="character"
        aria-pressed="true"
        class="text-gray-700 dark:text-gray-300"
      >
        <span data-mobile-view-mode-indicator class="w-full opacity-100"></span>
      </button>
      <button
        type="button"
        data-mobile-view-mode-toggle="true"
        data-view-mode="timeline"
        aria-pressed="false"
        class="text-gray-500 dark:text-gray-500"
      >
        <span data-mobile-view-mode-indicator class="w-0 opacity-0"></span>
      </button>
    </div>
  `
}

function getModeButton(mode: 'character' | 'timeline') {
  return document.querySelector<HTMLButtonElement>(
    `[data-mobile-view-mode-toggle="true"][data-view-mode="${mode}"]`,
  )
}

describe('mobileViewModeTabs', () => {
  beforeEach(() => {
    renderMobileTabsRoot()
    window.history.replaceState(null, '', '/')
  })

  it('syncs URL and active state when switching mode', () => {
    const timelineButton = getModeButton('timeline')
    const characterButton = getModeButton('character')

    const cleanup = mountMobileViewModeTabs()

    timelineButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(window.location.search).toBe('?view=timeline')
    expect(timelineButton?.getAttribute('aria-pressed')).toBe('true')
    expect(characterButton?.getAttribute('aria-pressed')).toBe('false')
    expect(timelineButton?.classList.contains('text-gray-700')).toBe(true)
    expect(characterButton?.classList.contains('text-gray-500')).toBe(true)

    cleanup()
  })

  it('updates active state from popstate and custom view-mode events', () => {
    window.history.replaceState(null, '', '/?view=timeline')
    const cleanup = mountMobileViewModeTabs()

    expect(getModeButton('timeline')?.getAttribute('aria-pressed')).toBe('true')

    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(getModeButton('character')?.getAttribute('aria-pressed')).toBe('true')

    window.history.replaceState(null, '', '/?view=timeline')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
    expect(getModeButton('timeline')?.getAttribute('aria-pressed')).toBe('true')

    cleanup()
  })

  it('removes click and window listeners on cleanup', () => {
    const cleanup = mountMobileViewModeTabs()
    cleanup()

    getModeButton('timeline')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(window.location.search).toBe('')

    window.history.replaceState(null, '', '/?view=timeline')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
    expect(getModeButton('character')?.getAttribute('aria-pressed')).toBe('true')
  })
})
