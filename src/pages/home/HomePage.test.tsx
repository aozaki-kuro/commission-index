// @vitest-environment jsdom
import type { Props } from '#data/types'
import type { SitePayload } from '#lib/sitePayload'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'

vi.mock('#components/home/commission', () => ({
  default: ({ activeChars }: { activeChars: Array<{ DisplayName: string }> }) => (
    <div data-testid="commission">{`commission:${activeChars.length}`}</div>
  ),
}))

vi.mock('#components/home/blocks/Description', () => ({
  default: ({
    commissionData,
    activeCharacters,
  }: {
    commissionData: Props
    activeCharacters: string[]
  }) => (
    <div data-testid="description">{`description:${commissionData.length}:${activeCharacters.join(',')}`}</div>
  ),
}))

vi.mock('#components/home/blocks/Footer', () => ({
  default: () => <div data-testid="footer">footer</div>,
}))

vi.mock('#components/home/search/CommissionSearchDeferred', () => ({
  default: () => <div data-testid="search">search</div>,
}))

vi.mock('#components/home/nav/CharacterList', () => ({
  default: ({ characters }: { characters: Array<{ DisplayName: string }> }) => (
    <div data-testid="character-list">{`character-list:${characters.length}`}</div>
  ),
}))

vi.mock('#components/home/nav/Hamburger', () => ({
  default: () => <div data-testid="hamburger">hamburger</div>,
}))

vi.mock('#components/home/warning/Warning', () => ({
  default: () => <div data-testid="warning">warning</div>,
}))

vi.mock('#components/home/dev/DevLiveRefresh', () => ({
  default: () => null,
}))

vi.mock('#lib/seo/useDocumentTitle', () => ({
  useDocumentTitle: () => undefined,
}))

const createPayload = (): SitePayload => ({
  commissionData: [
    {
      Character: 'Test Character',
      Commissions: [
        {
          fileName: '20260226_Test',
          Links: [],
        },
      ],
    },
  ],
  characterStatus: {
    active: [{ DisplayName: 'Test Character' }],
    stale: [],
  },
  creatorAliases: [],
  timelineGroups: [],
  monthNavItems: [],
  activeCharacterNames: ['Test Character'],
})

describe('HomePage bootstrap payload behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses bootstrap payload prop and skips initial fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<HomePage bootstrapPayload={createPayload()} />)

    expect(await screen.findByTestId('description')).toHaveTextContent(
      'description:1:Test Character',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches payload when no inlined payload exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(createPayload()), { status: 200 }))

    render(<HomePage />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/data/site-payload.json')
    })
    expect(await screen.findByTestId('description')).toHaveTextContent(
      'description:1:Test Character',
    )
  })

  it('keeps shell with non-blocking message when payload fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    render(<HomePage />)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Unable to refresh latest payload. Showing static content shell.',
    )
    expect(screen.getByTestId('description')).toHaveTextContent('description:0:')
  })
})
