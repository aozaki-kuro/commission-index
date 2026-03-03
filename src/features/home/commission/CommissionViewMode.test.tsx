// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CommissionViewModeProvider,
  CommissionViewModeToggle,
  CommissionViewPanel,
} from './CommissionViewMode'

const renderPanels = () =>
  render(
    <CommissionViewModeProvider>
      <CommissionViewModeToggle />
      <CommissionViewPanel panel="character" deferInactiveMount>
        <div data-testid="character-panel">character</div>
      </CommissionViewPanel>
      <CommissionViewPanel panel="timeline" deferInactiveMount>
        <div data-testid="timeline-panel">timeline</div>
      </CommissionViewPanel>
    </CommissionViewModeProvider>,
  )

describe('CommissionViewPanel deferred mount', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('mounts only active panel on first render and mounts the other after switching', () => {
    renderPanels()

    expect(screen.getByTestId('character-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'By Date' }))
    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'By Character' }))
    expect(screen.getByTestId('character-panel')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument()
  })

  it('respects timeline query mode as initial active panel', () => {
    window.history.replaceState(null, '', '/?view=timeline')

    renderPanels()

    expect(screen.getByTestId('timeline-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('character-panel')).not.toBeInTheDocument()
  })
})
