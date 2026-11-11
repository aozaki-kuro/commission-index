// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { LOAD_ARCHIVED_COMMAND_VALUE } from './commissionSearchConstants'
import { getDropdownItemCount, renderDropdown } from './commissionSearchDropdownRenderer'

function render(showArchived: boolean) {
  const list = document.createElement('ul')
  list.setAttribute('role', 'listbox')
  const onLoadArchivedCharacters = vi.fn()
  renderDropdown({
    container: list,
    suggestionViewModels: [
      {
        term: 'alpha',
        matchCountLabel: '2',
        sourcesLabel: 'Keyword',
        relatedTerms: [],
      },
      {
        term: 'beta',
        matchCountLabel: '1',
        sourcesLabel: 'Keyword',
        relatedTerms: [],
      },
    ],
    suggestionIsExclusion: false,
    suggestionOperator: 'and',
    sourcePrefix: 'From',
    shouldShowHiddenArchivedNotice: showArchived,
    hiddenArchivedNoticeMessage: 'hidden',
    visibleStatusMessage: 'status',
    loadArchivedCharactersLabel: 'Load',
    onSelectSuggestion: vi.fn(),
    onLoadArchivedCharacters,
  })
  return { list, onLoadArchivedCharacters }
}

describe('renderDropdown', () => {
  it('renders suggestions as li options directly owned by the listbox', () => {
    const { list } = render(false)

    const children = [...list.children]
    expect(children.map(child => [
      child.tagName,
      child.getAttribute('role'),
    ])).toEqual([
      ['LI', 'option'],
      ['LI', 'option'],
    ])
    expect(getDropdownItemCount(list)).toBe(2)
  })

  it('keeps the archived option behind a presentational li so the listbox owns only options', () => {
    const { list, onLoadArchivedCharacters } = render(true)

    const divider = list.lastElementChild!
    expect(divider.tagName).toBe('LI')
    expect(divider.getAttribute('role')).toBe('presentation')
    const option = divider.querySelector<HTMLElement>('[role="option"]')!
    expect(option.parentElement).toBe(divider)
    expect(option.id).toBe('search-suggestion-2')
    expect(option.dataset.value).toBe(LOAD_ARCHIVED_COMMAND_VALUE)
    expect(getDropdownItemCount(list)).toBe(3)

    option.click()
    expect(onLoadArchivedCharacters).toHaveBeenCalledOnce()
  })
})
