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
    const [characterCopy, timelineCopy] = [
      ...document.querySelectorAll<HTMLElement>('[id="shared-entry"]'),
    ]
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

    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite },
    })

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

    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite },
    })

    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    cleanup()
  })

  it('reacts to hashchange', () => {
    renderPanels()
    const scrollToHashWithoutWrite = vi.fn(() => true)
    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite },
    })
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()

    window.history.replaceState(null, '', '/#section-active')
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#section-active')
    cleanup()
  })

  function appendLink(href: string) {
    const link = document.createElement('a')
    link.href = href
    link.textContent = 'link'
    document.body.append(link)
    return link
  }

  // Returns whether the document handler prevented the click. window sees the event after document, so it can
  // record the result and then block jsdom's unimplemented link navigation.
  function click(link: HTMLElement, init: MouseEventInit = {}) {
    let defaultPrevented = false
    const record = (event: Event) => {
      defaultPrevented = event.defaultPrevented
      event.preventDefault()
    }
    window.addEventListener('click', record, { once: true })
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
    return { defaultPrevented }
  }

  it('same-hash click in timeline view scrolls the timeline copy', () => {
    renderPanels({ activeView: 'timeline' })
    window.history.replaceState(null, '', '/?view=timeline#shared-entry')
    const [characterCopy, timelineCopy] = [
      ...document.querySelectorAll<HTMLElement>('[id="shared-entry"]'),
    ]
    characterCopy.scrollIntoView = vi.fn()
    timelineCopy.scrollIntoView = vi.fn()
    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite: scrollToHashTargetFromHrefWithoutHash },
    })
    vi.mocked(timelineCopy.scrollIntoView).mockClear()

    const event = click(appendLink('#shared-entry'))

    expect(event.defaultPrevented).toBe(true)
    expect(timelineCopy.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(characterCopy.scrollIntoView).not.toHaveBeenCalled()
    cleanup()
  })

  it('leaves a click to a different hash to the native jump', () => {
    renderPanels({ activeView: 'timeline' })
    window.history.replaceState(null, '', '/?view=timeline#shared-entry')
    const scrollToHashWithoutWrite = vi.fn(() => true)
    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite },
    })
    scrollToHashWithoutWrite.mockClear()

    const event = click(appendLink('#section-active'))

    expect(event.defaultPrevented).toBe(false)
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
    cleanup()
  })

  it('leaves modified same-hash clicks alone', () => {
    renderPanels({ activeView: 'timeline' })
    window.history.replaceState(null, '', '/?view=timeline#shared-entry')
    const scrollToHashWithoutWrite = vi.fn(() => true)
    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite },
    })
    scrollToHashWithoutWrite.mockClear()
    const link = appendLink('#shared-entry')

    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { button: 1 },
    ]) {
      const event = click(link, init)
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(false)
    }
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
    cleanup()
  })

  it('dispose removes the hashchange and click listeners', () => {
    renderPanels()
    const scrollToHashWithoutWrite = vi.fn(() => true)
    const cleanup = mountHomeHashTarget({
      deps: { scrollToHashWithoutWrite },
    })
    cleanup()

    window.history.replaceState(null, '', '/#section-active')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    const event = click(appendLink('#section-active'))

    expect(event.defaultPrevented).toBe(false)
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()
  })
})
