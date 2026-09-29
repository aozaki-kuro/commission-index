// @vitest-environment jsdom
import type { BatchEntryPayload } from './batchPayload'
import { describe, expect, it } from 'vitest'
import { renderEntry, renderEntryInfo } from './batchRender'

function createEntry(overrides: Partial<BatchEntryPayload> = {}): BatchEntryPayload {
  return {
    id: 'artoria-pendragon-20240203',
    sectionId: 'artoria-pendragon',
    searchKey: 'artoria-pendragon:20240203',
    searchText: '',
    searchSuggest: '',
    altText: '',
    image: null,
    sourceImageNotFoundText: 'Source image not found',
    timeLabel: '2024/02/03',
    primaryText: 'artist',
    secondaryText: null,
    links: [],
    interest: null,
    ...overrides,
  }
}

describe('batchRender', () => {
  it('renders design links and unpublished interest together', () => {
    const root = renderEntryInfo(createEntry({
      links: [
        {
          label: 'Design',
          url: 'https://example.com/design',
        },
      ],
      interest: {
        key: 'artoria-pendragon-20240203',
        label: 'Want this',
        title: 'Record interest in this unpublished commission',
        recordedLabel: 'Wanted',
        recordedTitle: 'Interest recorded',
      },
    }))

    expect(root.querySelector('a[href="https://example.com/design"]')?.textContent).toBe('Design')
    expect(root.querySelector('[data-commission-interest-key]')?.textContent).toContain('Want this')
  })

  it('renders stable entry IDs and optional legacy anchors', () => {
    const root = renderEntry(createEntry({
      id: 'alpha-commission-42',
      legacyAnchorId: 'alpha-20240203',
    }))

    expect(root.id).toBe('alpha-commission-42')
    expect(root.querySelector('#alpha-20240203')?.getAttribute('aria-hidden')).toBe('true')
  })
})
