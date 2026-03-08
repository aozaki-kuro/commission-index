// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCommissionViewMode } from './CommissionViewMode'
import { replaceCommissionViewModeInAddress } from './viewModeState'

const ModeValue = () => {
  const mode = useCommissionViewMode()
  return <p data-testid="view-mode">{mode}</p>
}

describe('useCommissionViewMode', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('reads the current mode from the url on first render', () => {
    window.history.replaceState(null, '', '/?view=timeline')

    render(<ModeValue />)

    expect(screen.getByTestId('view-mode')).toHaveTextContent('timeline')
  })

  it('subscribes to view mode changes', () => {
    render(<ModeValue />)

    expect(screen.getByTestId('view-mode')).toHaveTextContent('character')

    act(() => {
      replaceCommissionViewModeInAddress(window, 'timeline')
    })

    expect(screen.getByTestId('view-mode')).toHaveTextContent('timeline')
  })
})
