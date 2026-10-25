// @vitest-environment jsdom
import { mountArchivedCharactersToggle } from '@features/home/commission/archivedCharactersToggle'
import { scrollToHashTargetFromHrefWithoutHash } from '@lib/navigation/hashAnchor'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountHomeHashTarget } from './homeHashTarget'

function renderPanels({ activeView = 'character' }: { activeView?: 'character' | 'timeline' } = {}) {
  const characterActive = activeView === 'character'
  document.body.innerHTML = `
    <div data-commission-view-panel="character" data-commission-view-active="${characterActive}" data-archived-visibility="hidden" class="${characterActive ? '' : 'hidden'}">
      <section id="section-active" data-character-section="true" data-character-status="active">
        <article id="shared-entry" data-commission-entry="true"></article>
      </section>
      <div data-archived-sections-placeholder="true"></div>
      <div data-archived-divider="true" class="hidden"></div>
      <div data-archived-sections-container="true" class="hidden">
        <section id="section-archived" data-character-section="true" data-character-status="archived">
          <article id="archived-entry" data-commission-entry="true"></article>
        </section>
      </div>
    </div>
    <div data-commission-view-panel="timeline" data-commission-view-active="${!characterActive}" class="${characterActive ? 'hidden' : ''}">
      <article id="shared-entry" data-commission-entry="true"></article>
    </div>
  `
}

describe('mountHomeHashTarget', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/')
  })

  it('scrolls to the active-panel copy when ids are shared', () => {
    renderPanels({ activeView: 'timeline' })
    window.history.replaceState(null, '', '/?view=timeline#shared-entry')
    const [characterCopy, timelineCopy] = [...document.querySelectorAll<HTMLElement>('[id="shared-entry"]')]
    characterCopy.scrollIntoView = vi.fn()
    timelineCopy.scrollIntoView = vi.fn()

    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash },
    })

    expect(timelineCopy.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(characterCopy.scrollIntoView).not.toHaveBeenCalled()
    cleanup()
  })

  it('expands archived before scrolling to an archived target', () => {
    renderPanels()
    window.history.replaceState(null, '', '/#archived-entry')
    const disposeToggle = mountArchivedCharactersToggle()
    const container = document.querySelector<HTMLElement>('[data-archived-sections-container="true"]')!
    const containerHiddenAtScroll: boolean[] = []
    const scrollToHashWithoutWrite = vi.fn(() => {
      containerHiddenAtScroll.push(container.classList.contains('hidden'))
      return true
    })

    const cleanup = mountHomeHashTarget({ deps: { scrollToHashWithoutWrite } })

    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#archived-entry')
    expect(containerHiddenAtScroll).toEqual([false])
    expect(
      document.querySelector<HTMLElement>('[data-commission-view-panel="character"]')?.dataset.archivedVisibility,
    ).toBe('visible')
    cleanup()
    disposeToggle()
  })

  it('ignores unknown hashes', () => {
    renderPanels()
    window.history.replaceState(null, '', '/#missing-entry')
    const scrollToHashWithoutWrite = vi.fn(() => true)

    const cleanup = mountHomeHashTarget({ deps: { scrollToHashWithoutWrite } })

    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    cleanup()
  })

  it('reacts to hashchange', () => {
    renderPanels()
    const scrollToHashWithoutWrite = vi.fn(() => true)
    const cleanup = mountHomeHashTarget({ deps: { scrollToHashWithoutWrite } })
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()

    window.history.replaceState(null, '', '/#section-active')
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-active')
    cleanup()
  })

  it('dispose removes the hashchange listener', () => {
    renderPanels()
    const scrollToHashWithoutWrite = vi.fn(() => true)
    const cleanup = mountHomeHashTarget({ deps: { scrollToHashWithoutWrite } })
    cleanup()

    window.history.replaceState(null, '', '/#section-active')
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
  })
})
