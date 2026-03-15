import { COMMISSION_VIEW_MODE_CHANGE_EVENT } from '#features/home/commission/viewModeEvent'
import { SIDEBAR_SEARCH_STATE_EVENT } from '#lib/navigation/sidebarSearchState'
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { clearHomeTimelineBatchManifestCacheForTests } from './homeTimelineBatchManifest'
import { requestTimelineViewLoad } from './timelineViewEvent'
import { mountTimelineViewLoader, TIMELINE_VIEW_LOADED_EVENT } from './timelineViewLoader'

function renderFixture() {
  clearHomeTimelineBatchManifestCacheForTests()
  document.body.innerHTML = `
    <div data-commission-view-panel="timeline" data-timeline-loaded="false" data-timeline-batches-loaded-count="0" class="hidden">
      <div data-timeline-sections-container="true">
        <section id="timeline-year-2026"></section>
      </div>
      <div data-timeline-sections-sentinel="true"></div>
      <template data-timeline-batch-index="0">
        <section id="timeline-year-2025"></section>
      </template>
      <template data-timeline-batch-index="1">
        <section id="timeline-year-2024"></section>
      </template>
    </div>
    <script type="application/json" data-home-timeline-batch-manifest="true">
      {
        "initialSectionIds": ["timeline-year-2026"],
        "totalBatches": 2,
        "targetBatchById": {
          "timeline-year-2025": 0,
          "timeline-year-2024": 1
        }
      }
    </script>
  `
  clearHomeTimelineBatchManifestCacheForTests()
}

async function flushTimelineQueue() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

describe('mountTimelineViewLoader', () => {
  it('loads deferred timeline batches on initial timeline mode and scrolls to hash target', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2024')

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const scrollToHashWithoutWrite = vi.fn()

    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2024')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-loaded'),
    ).toBe('true')
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-batches-loaded-count'),
    ).toBe('2')
    expect(onLoaded).toHaveBeenCalled()
    expect(onSidebarSync).toHaveBeenCalled()
    expect(scrollToHashWithoutWrite).toHaveBeenCalledWith('#timeline-year-2024')

    cleanup()
    window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })

  it('loads target timeline batch when the view mode switches later', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/')
    const scrollToHashWithoutWrite = vi.fn()

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })

    expect(document.getElementById('timeline-year-2025')).toBeNull()

    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2025')
    window.dispatchEvent(new Event(COMMISSION_VIEW_MODE_CHANGE_EVENT))
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-batches-loaded-count'),
    ).toBe('2')

    cleanup()
  })

  it('loads all deferred timeline batches when explicitly requested', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline')

    const cleanup = mountTimelineViewLoader()

    requestTimelineViewLoad(window, { strategy: 'all' })
    await flushTimelineQueue()

    expect(document.getElementById('timeline-year-2025')).toBeTruthy()
    expect(document.getElementById('timeline-year-2024')).toBeTruthy()
    expect(
      document
        .querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
        ?.getAttribute('data-timeline-loaded'),
    ).toBe('true')

    cleanup()
  })

  it('does not remount or re-scroll when timeline batches were already loaded', async () => {
    renderFixture()
    window.history.replaceState(null, '', '/?view=timeline#timeline-year-2024')

    const panel = document.querySelector<HTMLElement>('[data-commission-view-panel="timeline"]')
    const container = document.querySelector<HTMLElement>(
      '[data-timeline-sections-container="true"]',
    )
    panel?.setAttribute('data-timeline-loaded', 'true')
    panel?.setAttribute('data-timeline-batches-loaded-count', '2')
    container?.insertAdjacentHTML(
      'beforeend',
      '<section id="timeline-year-2025"></section><section id="timeline-year-2024"></section>',
    )

    const onLoaded = vi.fn()
    const onSidebarSync = vi.fn()
    const scrollToHashWithoutWrite = vi.fn()

    window.addEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.addEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)

    const cleanup = mountTimelineViewLoader({
      deps: {
        scrollToHashWithoutWrite,
      },
    })
    await Promise.resolve()

    expect(document.querySelectorAll('#timeline-year-2025')).toHaveLength(1)
    expect(document.querySelectorAll('#timeline-year-2024')).toHaveLength(1)
    expect(onLoaded).not.toHaveBeenCalled()
    expect(onSidebarSync).not.toHaveBeenCalled()
    expect(scrollToHashWithoutWrite).not.toHaveBeenCalled()

    cleanup()
    window.removeEventListener(TIMELINE_VIEW_LOADED_EVENT, onLoaded)
    window.removeEventListener(SIDEBAR_SEARCH_STATE_EVENT, onSidebarSync)
  })
})
