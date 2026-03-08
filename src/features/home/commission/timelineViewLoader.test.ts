// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { TIMELINE_VIEW_LOADED_EVENT, mountTimelineViewLoader } from './timelineViewLoader'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'

const renderFixture = () => {
  document.body.innerHTML = `
    <div data-commission-view-panel="timeline" data-timeline-loaded="false" class="hidden">
      <div data-timeline-sections-container="true"></div>
      <template data-timeline-sections-template="true">
        <section id="timeline-year-2025"></section>
      </template>
    </div>
  `
}

describe('mountTimelineViewLoader', () => {
  it('loads timeline sections on initial timeline mode and scrolls to hash target', () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2025')

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const scrollToHashWithoutWrite = vi.fn()
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0)
        return 1
      })

    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-loaded'),
    ).toBe('true')
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onSidebarSync).toHaveBeenCalledTimes(1)
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#timeline-year-2025')

    cleanup()
    requestAnimationFrameSpy.mockRestore()
    window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })

  it('loads timeline sections when the view mode switches later', () => {
    renderFixture()
    window.history.replaceState(null, '', '/')

    const cleanup = mountTimelineViewLoader()

    expect(document.getElementById('timeline-year-2025')).toBeNull()

    window.history.replaceState(null, '', '/?view=timeline')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()

    cleanup()
  })
})
