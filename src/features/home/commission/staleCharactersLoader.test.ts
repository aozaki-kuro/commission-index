// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  STALE_CHARACTERS_COLLAPSED_EVENT,
  STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT,
  STALE_CHARACTERS_LOADED_EVENT,
  STALE_CHARACTERS_LOAD_REQUEST_EVENT,
  STALE_CHARACTERS_STATE_CHANGE_EVENT,
} from '#features/home/commission/staleCharactersEvent'
import { mountStaleCharactersLoader } from '#features/home/commission/staleCharactersLoader'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'

const renderFixture = () => {
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-stale-loaded="false" data-stale-visibility="hidden">
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
    const onStateChanged = vi.fn()
    window.addEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)

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
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-visibility'),
    ).toBe('visible')
    expect(
      document
        .querySelector<HTMLElement>('[data-stale-sections-placeholder="true"]')
        ?.classList.contains('hidden'),
    ).toBe(true)
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onSidebarSync).toHaveBeenCalledTimes(1)
    expect(onStateChanged).toHaveBeenCalledTimes(1)
    expect(
      (onStateChanged.mock.calls[0]?.[0] as CustomEvent<{ visibility: string; loaded: boolean }>)
        .detail,
    ).toEqual({
      visibility: 'visible',
      loaded: true,
    })

    cleanup()
    window.removeEventListener(STALE_CHARACTERS_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
    window.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)
  })

  it('supports global request event', () => {
    renderFixture()
    const cleanup = mountStaleCharactersLoader()
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOAD_REQUEST_EVENT))

    expect(document.getElementById('section-stale')).toBeTruthy()
    cleanup()
  })

  it('loads stale sections from an initial hash target inside the template', () => {
    renderFixture()
    document.querySelector('template[data-stale-sections-template="true"]')!.innerHTML = `
      <section id="section-stale"></section>
      <template data-section-entries-template="true">
        <article id="section-stale-20240101"></article>
      </template>
    `
    window.history.replaceState(null, '', '#section-stale-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn()

    const cleanup = mountStaleCharactersLoader({
      deps: { scrollToHashWithoutWrite },
    })

    expect(document.getElementById('section-stale')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('true')
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-stale-20240101')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('collapses loaded stale sections when requested', () => {
    renderFixture()
    const onCollapsed = vi.fn()
    const onStateChanged = vi.fn()
    window.addEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, onCollapsed)
    window.addEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)

    const cleanup = mountStaleCharactersLoader()
    window.dispatchEvent(new Event(STALE_CHARACTERS_LOAD_REQUEST_EVENT))
    window.dispatchEvent(new Event(STALE_CHARACTERS_COLLAPSE_REQUEST_EVENT))

    expect(document.getElementById('section-stale')).toBeNull()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-loaded'),
    ).toBe('false')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="character"]')
        ?.getAttribute('data-stale-visibility'),
    ).toBe('hidden')
    expect(
      document
        .querySelector<HTMLElement>('[data-stale-sections-placeholder="true"]')
        ?.classList.contains('hidden'),
    ).toBe(false)
    expect(onCollapsed).toHaveBeenCalledTimes(1)
    expect(onStateChanged).toHaveBeenCalledTimes(2)
    expect(
      (onStateChanged.mock.calls[1]?.[0] as CustomEvent<{ visibility: string; loaded: boolean }>)
        .detail,
    ).toEqual({
      visibility: 'hidden',
      loaded: false,
    })

    cleanup()
    window.removeEventListener(STALE_CHARACTERS_COLLAPSED_EVENT, onCollapsed)
    window.removeEventListener(STALE_CHARACTERS_STATE_CHANGE_EVENT, onStateChanged)
  })
})
