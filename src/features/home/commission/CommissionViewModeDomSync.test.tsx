// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CommissionViewModeProvider, CommissionViewModeToggle } from './CommissionViewMode'
import CommissionViewModeDomSync from './CommissionViewModeDomSync'

const renderDomSyncFixture = () =>
  render(
    <CommissionViewModeProvider>
      <CommissionViewModeToggle />
      <CommissionViewModeDomSync />
      <div data-testid="character-panel" data-commission-view-panel="character">
        character
      </div>
      <div data-testid="timeline-panel" data-commission-view-panel="timeline" className="hidden">
        timeline
      </div>
    </CommissionViewModeProvider>,
  )

describe('CommissionViewModeDomSync', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('toggles panel visibility and active flag when view mode changes', () => {
    renderDomSyncFixture()

    const characterPanel = screen.getByTestId('character-panel')
    const timelinePanel = screen.getByTestId('timeline-panel')
    expect(characterPanel.dataset.commissionViewActive).toBe('true')
    expect(timelinePanel.dataset.commissionViewActive).toBe('false')
    expect(characterPanel).not.toHaveClass('hidden')
    expect(timelinePanel).toHaveClass('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'By Date' }))
    expect(characterPanel.dataset.commissionViewActive).toBe('false')
    expect(timelinePanel.dataset.commissionViewActive).toBe('true')
    expect(characterPanel).toHaveClass('hidden')
    expect(timelinePanel).not.toHaveClass('hidden')
  })
})
