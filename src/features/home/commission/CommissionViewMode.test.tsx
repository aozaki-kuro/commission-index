// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CommissionViewModeProvider,
  CommissionViewPanel,
  useCommissionViewMode,
} from './CommissionViewMode'

const ModeButton = ({
  mode,
  children,
}: {
  mode: 'character' | 'timeline'
  children: ReactNode
}) => {
  const { setMode } = useCommissionViewMode()
  return (
    <button type="button" onClick={() => setMode(mode)}>
      {children}
    </button>
  )
}

const renderPanels = () =>
  render(
    <CommissionViewModeProvider>
      <ModeButton mode="character">By Character</ModeButton>
      <ModeButton mode="timeline">By Date</ModeButton>
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
