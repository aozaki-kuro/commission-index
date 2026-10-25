import { ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, requestArchivedCharactersVisibility } from '@features/home/commission/archivedCharactersState'
// @vitest-environment jsdom
import { mountArchivedCharactersToggle } from '@features/home/commission/archivedCharactersToggle'
import { describe, expect, it, vi } from 'vitest'
import { revealArchivedHomeNavTarget } from './homeNavTargetClient'

describe('homeNavTargetClient', () => {
  it('waits for archived visibility before continuing', () => {
    const onVisible = vi.fn()
    const requestArchivedVisibility = vi.fn((win: Window) => {
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible' },
        }),
      )
    })

    revealArchivedHomeNavTarget({
      onVisible,
      requestArchivedVisibility,
      win: window,
    })

    expect(requestArchivedVisibility).toHaveBeenCalledWith(window, 'visible')
    expect(onVisible).toHaveBeenCalledTimes(1)
  })

  it('ignores unrelated archived state changes until visibility is actually visible', () => {
    const onVisible = vi.fn()
    const requestArchivedVisibility = vi.fn((win: Window) => {
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'hidden' },
        }),
      )
      win.dispatchEvent(
        new CustomEvent(ARCHIVED_CHARACTERS_STATE_CHANGE_EVENT, {
          detail: { visibility: 'visible' },
        }),
      )
    })

    revealArchivedHomeNavTarget({
      onVisible,
      requestArchivedVisibility,
      win: window,
    })

    expect(onVisible).toHaveBeenCalledTimes(1)
  })

  it('calls onVisible when the show request is answered synchronously', () => {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-archived-visibility="hidden">
        <div data-archived-sections-placeholder="true"></div>
        <div data-archived-divider="true" class="hidden"></div>
        <div data-archived-sections-container="true" class="hidden">
          <section id="section-archived" data-character-section="true" data-character-status="archived"></section>
        </div>
      </div>
    `
    const disposeToggle = mountArchivedCharactersToggle()
    const onVisible = vi.fn()

    revealArchivedHomeNavTarget({
      onVisible,
      requestArchivedVisibility: requestArchivedCharactersVisibility,
      win: window,
    })

    expect(onVisible).toHaveBeenCalledTimes(1)
    disposeToggle()
    document.body.innerHTML = ''
  })
})
