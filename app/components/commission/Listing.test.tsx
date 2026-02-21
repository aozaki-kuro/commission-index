/* eslint-disable @next/next/no-img-element */
import type { CharacterCommissions } from '#data/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Listing from './Listing'

vi.mock('#components/Title', () => ({
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
  it('renders empty state when character has no commissions', () => {
    render(<Listing Character="Test Character" status="active" commissionMap={createMap([])} />)

    expect(screen.getByText('To be announced ...')).toBeInTheDocument()
    expect(document.getElementById('test-character')).toHaveAttribute('data-total-commissions', '0')
  })

  it('builds searchable metadata and anonymous alt text for commission entries', () => {
    render(
      <Listing
        Character="Test Character"
        status="stale"
        commissionMap={createMap([
          {
            fileName: '20240203',
            Links: [],
            Description: 'Sample description',
            Keyword: 'tag,Tag',
          },
        ])}
      />,
    )

    const entry = document.querySelector('[data-commission-entry="true"]')
    expect(entry).toBeInTheDocument()
    const searchText = entry?.getAttribute('data-search-text') ?? ''
    expect(searchText).toContain('test character')
    expect(searchText).toContain('20240203')
    expect(searchText).toContain('2024/02/03')

    const searchSuggest = entry?.getAttribute('data-search-suggest') ?? ''
    expect(searchSuggest).toContain('Character\tTest Character')
    expect(searchSuggest.match(/Keyword\t/gu)).toHaveLength(1)

    expect(screen.getByRole('img', { name: '©️ 2024 Anonymous & Crystallize' })).toBeInTheDocument()
  })
})
