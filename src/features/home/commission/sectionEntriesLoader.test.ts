// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { ACTIVE_CHARACTERS_LOADED_EVENT } from '#features/home/commission/activeCharactersEvent'
import {
  SECTION_ENTRIES_LOADED_EVENT,
  SECTION_ENTRIES_LOAD_REQUEST_EVENT,
} from '#features/home/commission/sectionEntriesEvent'
import { mountSectionEntriesLoader } from './sectionEntriesLoader'

const renderFixture = () => {
  document.body.innerHTML = `
    <div data-commission-view-panel="character">
      <section id="section-alpha" data-character-section="true" data-section-entries-loaded="false">
        <div data-section-entries-container="true"></div>
        <div data-section-entries-sentinel="true"></div>
        <template data-section-entries-template="true">
          <article id="section-alpha-20240101" data-commission-entry="true"></article>
        </template>
      </section>
    </div>
  `
}

describe('mountSectionEntriesLoader', () => {
  it('loads deferred section entries on global request', () => {
    renderFixture()
    const onLoaded = vi.fn()
    window.addEventListener(SECTION_ENTRIES_LOADED_EVENT, onLoaded)

    const cleanup = mountSectionEntriesLoader()
    window.dispatchEvent(new Event(SECTION_ENTRIES_LOAD_REQUEST_EVENT))

    expect(document.getElementById('section-alpha-20240101')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-character-section="true"]')
        ?.getAttribute('data-section-entries-loaded'),
    ).toBe('true')
    expect(onLoaded).toHaveBeenCalledTimes(1)

    cleanup()
    window.removeEventListener(SECTION_ENTRIES_LOADED_EVENT, onLoaded)
  })

  it('loads deferred section entries for an initial hash target and scrolls after mount', () => {
    renderFixture()
    window.history.replaceState(null, '', '#section-alpha-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn()

    const cleanup = mountSectionEntriesLoader({
      deps: { scrollToHashWithoutWrite },
    })

    expect(document.getElementById('section-alpha-20240101')).toBeTruthy()
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-alpha-20240101')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })

  it('re-checks the current hash when active sections mount later', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character">
        <div id="section-host"></div>
      </div>
    `
    window.history.replaceState(null, '', '#section-beta-20240101')

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })
    const scrollToHashWithoutWrite = vi.fn()
    const cleanup = mountSectionEntriesLoader({
      deps: { scrollToHashWithoutWrite },
    })

    document.getElementById('section-host')?.insertAdjacentHTML(
      'beforeend',
      `
        <section id="section-beta" data-character-section="true" data-section-entries-loaded="false">
          <div data-section-entries-container="true"></div>
          <div data-section-entries-sentinel="true"></div>
          <template data-section-entries-template="true">
            <article id="section-beta-20240101" data-commission-entry="true"></article>
          </template>
        </section>
      `,
    )

    window.dispatchEvent(new Event(ACTIVE_CHARACTERS_LOADED_EVENT))

    expect(document.getElementById('section-beta-20240101')).toBeTruthy()
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-beta-20240101')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.history.replaceState(null, '', '/')
  })
})
