// @vitest-environment jsdom
import type { CharacterCommissions } from '#data/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Listing from './Listing'

vi.mock('#components/shared/Title', () => ({
  default: ({ Content }: { Content: string }) => <h2>{Content}</h2>,
}))

vi.mock('./IllustratorInfo', () => ({
  default: ({ commission }: { commission: { fileName: string } }) => (
    <div data-testid="illustrator-info">{commission.fileName}</div>
  ),
}))

vi.mock('./ProtectedCommissionImage', () => ({
  default: ({ altText }: { altText: string }) => <img alt={altText} />,
}))

vi.mock('#data/creatorAliases', () => ({
  normalizeCreatorSearchName: (value: string) => value.replace(/\s+\(part\s+\d+\)$/i, '').trim(),
}))

const createMap = (commissions: CharacterCommissions['Commissions']) =>
  new Map<string, CharacterCommissions>([
    [
      'Test Character',
      {
        Character: 'Test Character',
        Commissions: commissions,
      },
    ],
  ])

describe('Listing', () => {
  const getEntryByImageAlt = (altText: string) =>
    screen.getByRole('img', { name: altText }).closest('[data-commission-entry="true"]')

  it('renders empty state when character has no commissions', async () => {
    render(
      await Listing({
        Character: 'Test Character',
        status: 'active',
        commissionMap: createMap([]),
        creatorAliasesMap: new Map(),
      }),
    )

    expect(screen.getByText('To be announced ...')).toBeInTheDocument()
    expect(document.getElementById('test-character')).toHaveAttribute('data-total-commissions', '0')
  })

  it('builds searchable metadata, aliases, and normalized creator labels for commission entries', async () => {
    render(
      await Listing({
        Character: 'Test Character',
        status: 'stale',
        commissionMap: createMap([
          {
            fileName: '20240203',
            Links: [],
            Description: 'Sample description',
            Keyword: 'tag,Tag',
          },
          {
            fileName: '20240204_七市',
            Links: [],
          },
          {
            fileName: '20240819_Q (part 2)',
            Links: [],
          },
        ]),
        creatorAliasesMap: new Map([['七市', ['Nanashi', 'nanashi']]]),
      }),
    )

    const entry = getEntryByImageAlt('© 2024 Anonymous & Crystallize')
    expect(entry).toBeInTheDocument()
    const searchText = entry?.getAttribute('data-search-text') ?? ''
    expect(searchText).toContain('test character')
    expect(searchText).toContain('20240203')
    expect(searchText).toContain('date_y_2024')
    expect(searchText).toContain('date_ym_2024_02')

    const searchSuggest = entry?.getAttribute('data-search-suggest') ?? ''
    expect(searchSuggest).toContain('Character\tTest Character')
    expect(searchSuggest).toContain('Date\t2024/02')
    expect(searchSuggest.match(/Keyword\t/gu)).toHaveLength(1)

    expect(screen.getByRole('img', { name: '© 2024 Anonymous & Crystallize' })).toBeInTheDocument()

    const aliasEntry = getEntryByImageAlt('© 2024 七市 & Crystallize')
    const aliasSearchText = aliasEntry?.getAttribute('data-search-text') ?? ''
    expect(aliasSearchText).toContain('七市')
    expect(aliasSearchText).toContain('nanashi')

    const aliasSearchSuggest = aliasEntry?.getAttribute('data-search-suggest') ?? ''
    expect(aliasSearchSuggest).toContain('Creator\t七市')
    expect(aliasSearchSuggest).toContain('Creator\tNanashi')

    const partEntry = getEntryByImageAlt('© 2024 Q & Crystallize')
    const partSearchText = partEntry?.getAttribute('data-search-text') ?? ''
    const partSearchSuggest = partEntry?.getAttribute('data-search-suggest') ?? ''

    expect(partSearchText).toContain('q')
    expect(partSearchText).not.toContain('part')
    expect(partSearchSuggest).toContain('Creator\tQ')
    expect(partSearchSuggest).not.toContain('Creator\tQ (part 2)')
    expect(screen.getByRole('img', { name: '© 2024 Q & Crystallize' })).toBeInTheDocument()
  })
})
