// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { mountStaleCharactersLoader } from '#features/home/commission/staleCharactersLoader'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'

const renderFixture = () => {
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-stale-loaded="false">
      <div data-stale-sections-placeholder="true"></div>
      <button type="button" data-load-stale-characters="true">Load</button>
      <div data-stale-sections-container="true"></div>
      <template data-stale-sections-template="true">
        <section id="section-stale"></section>
      </template>
    </div>
  `
}

describe('mountStaleCharactersLoader', () => {
  it('injects stale sections and dispatches loaded + sidebar sync events', () => {
    renderFixture()
    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountStaleCharactersLoader()
    document
      .querySelector<HTMLElement>('[data-load-stale-characters="true"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(document.getElementById('section-stale')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('true')
    expect(
      document
        .querySelector<HTMLElement>('[data-stale-sections-placeholder="true"]')
        ?.classList.contains('hidden'),
    ).toBe(true)
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onSidebarSync).toHaveBeenCalledTimes(1)

    cleanup()
    window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })

  it('supports global request event', () => {
    renderFixture()
    const cleanup = mountStaleCharactersLoader()
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOAD_REQUEST_EVENT))

    expect(document.getElementById('section-stale')).toBeTruthy()
    cleanup()
  })
})
