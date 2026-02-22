/* eslint-disable @next/next/no-img-element */
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

vi.mock('#data/imageImports', () => ({
  imageImports: {},
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

  it('builds searchable metadata and anonymous alt text for commission entries', async () => {
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
        ]),
        creatorAliasesMap: new Map(),
      }),
    )

    const entry = document.querySelector('[data-commission-entry="true"]')
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

    expect(screen.getByRole('img', { name: '©️ 2024 Anonymous & Crystallize' })).toBeInTheDocument()
  })

  it('includes creator aliases in searchable metadata and creator suggestions', async () => {
    render(
      await Listing({
        Character: 'Test Character',
        status: 'active',
        commissionMap: createMap([
          {
            fileName: '20240203_七市',
            Links: [],
          },
        ]),
        creatorAliasesMap: new Map([['七市', ['Nanashi', 'nanashi']]]),
      }),
    )

    const entry = document.querySelector('[data-commission-entry="true"]')
    const searchText = entry?.getAttribute('data-search-text') ?? ''
    expect(searchText).toContain('七市')
    expect(searchText).toContain('nanashi')

    const searchSuggest = entry?.getAttribute('data-search-suggest') ?? ''
    expect(searchSuggest).toContain('Creator\t七市')
    expect(searchSuggest).toContain('Creator\tNanashi')
  })

  it('strips part suffix from creator name in copyright alt text', async () => {
    render(
      await Listing({
        Character: 'Test Character',
        status: 'active',
        commissionMap: createMap([
          {
            fileName: '20240819_Q (part 2)',
            Links: [],
          },
        ]),
        creatorAliasesMap: new Map(),
      }),
    )

    expect(screen.getByRole('img', { name: '©️ 2024 Q & Crystallize' })).toBeInTheDocument()
  })
})
