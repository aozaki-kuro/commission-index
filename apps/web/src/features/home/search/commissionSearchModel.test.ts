// @vitest-environment jsdom
import type { CommissionSearchEntrySource } from './commissionSearchIndex'
import type { SearchControls } from './commissionSearchModel'
import type { PanelLoadedState } from './commissionSearchPanelState'
import { LOAD_ARCHIVED_COMMAND_VALUE } from '@features/home/search/commissionSearchConstants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeSearchModel,
  dispatchSearchQueryLocationChange,
  getDomSnapshotKeyForMode,
  resetModelState,
  resolveEffectiveDomSnapshotKey,
  subscribeToUrlQuerySnapshot,
} from './commissionSearchModel'

vi.mock('@lib/analytics/track', () => ({ trackRybbitEvent: vi.fn() }))

describe('getDomSnapshotKeyForMode', () => {
  it('keys the character snapshot by archived visibility only', () => {
    const hidden = getDomSnapshotKeyForMode({ mode: 'character', archivedVisible: false })
    const visible = getDomSnapshotKeyForMode({ mode: 'character', archivedVisible: true })

    expect(visible).not.toBe(hidden)
  })

  it('keeps one timeline snapshot key regardless of archived visibility', () => {
    expect(getDomSnapshotKeyForMode({ mode: 'timeline', archivedVisible: false })).toBe(
      getDomSnapshotKeyForMode({ mode: 'timeline', archivedVisible: true }),
    )
    expect(getDomSnapshotKeyForMode({ mode: 'timeline', archivedVisible: false })).not.toBe(
      getDomSnapshotKeyForMode({ mode: 'character', archivedVisible: false }),
    )
  })
})

describe('resolveEffectiveDomSnapshotKey', () => {
  it('uses a stable key when dom context is skipped', () => {
    const first = resolveEffectiveDomSnapshotKey({
      domSnapshotKey: 'character:archived-hidden',
      skipDomContext: true,
    })
    const second = resolveEffectiveDomSnapshotKey({
      domSnapshotKey: 'character:archived-loaded',
      skipDomContext: true,
    })

    expect(first).toBe('skip-dom-context')
    expect(second).toBe(first)
  })
})

describe('subscribeToUrlQuerySnapshot', () => {
  it('notifies listeners for explicit location query updates', () => {
    const onStoreChange = vi.fn()
    const unsubscribe = subscribeToUrlQuerySnapshot(onStoreChange)

    dispatchSearchQueryLocationChange()

    expect(onStoreChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

describe('computeSearchModel archived matches', () => {
  const controls: SearchControls = {
    sourceCharacter: 'Character',
    sourceCreator: 'Creator',
    sourceKeyword: 'Keyword',
    sourceDate: 'Date',
    formatMatchCount: count => `${count}`,
    formatSearchResultsStatus: (matched, total) => `${matched}/${total}`,
    formatSearchClearedStatus: total => `${total}`,
    formatHiddenArchivedResultsNotice: count => `${count} hidden`,
  }
  const externalEntries: CommissionSearchEntrySource[] = [
    { id: 0, domKey: 'section-alpha::alpha', searchText: 'alpha', searchSuggest: 'Keyword\talpha' },
    { id: 1, domKey: 'section-orion::orion', searchText: 'orion', searchSuggest: 'Keyword\torion' },
  ]

  function renderCharacterPanel(archivedVisible: boolean) {
    document.body.innerHTML = `
      <div data-commission-view-panel="character" data-commission-view-active="true" data-archived-visibility="${archivedVisible ? 'visible' : 'hidden'}">
        <section id="section-alpha" data-character-section="true" data-character-status="active">
          <article data-commission-entry="true" data-character-section-id="section-alpha" data-commission-search-key="section-alpha::alpha"></article>
        </section>
        <div data-archived-sections-container="true" class="${archivedVisible ? '' : 'hidden'}">
          <section id="section-orion" data-character-section="true" data-character-status="archived">
            <article data-commission-entry="true" data-character-section-id="section-orion" data-commission-search-key="section-orion::orion"></article>
          </section>
        </div>
      </div>
    `
  }

  function compute(archivedVisible: boolean) {
    const panelState: PanelLoadedState = { archivedVisible }
    return computeSearchModel({
      query: 'orion',
      mode: 'character',
      panelState,
      externalEntries,
      isIndexReady: true,
      shouldWarmFuse: false,
      isSuggestionPanelDismissed: false,
      // The keyboard-selected command is "load archived"; it only stays active while the notice shows.
      activeCommandValue: LOAD_ARCHIVED_COMMAND_VALUE,
      controls,
      suggestionAliasGroups: [],
      disableDomFiltering: false,
      suppressInitialSuggestionPanelAnimation: false,
    })
  }

  beforeEach(() => {
    resetModelState()
  })

  it('archived-only match while collapsed shows hidden-matches notice', () => {
    renderCharacterPanel(false)

    const model = compute(false)

    expect(model.visibleMatchedCount).toBe(0)
    expect(model.visibleEntriesCount).toBe(1)
    expect(model.hiddenArchivedMatchedCount).toBe(1)
    expect(model.shouldShowHiddenArchivedNotice).toBe(true)
    expect(model.shouldShowSuggestionPanel).toBe(true)
    expect(model.resolvedActiveCommandValue).toBe(LOAD_ARCHIVED_COMMAND_VALUE)
  })

  it('counts archived matches as visible once archived is expanded', () => {
    renderCharacterPanel(true)

    const model = compute(true)

    expect(model.visibleMatchedCount).toBe(1)
    expect(model.visibleEntriesCount).toBe(2)
    expect(model.hiddenArchivedMatchedCount).toBe(0)
    expect(model.shouldShowHiddenArchivedNotice).toBe(false)
    expect(model.resolvedActiveCommandValue).not.toBe(LOAD_ARCHIVED_COMMAND_VALUE)
  })
})
