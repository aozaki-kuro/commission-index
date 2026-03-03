// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Warning, { CONFIRMED_AGE_KEY } from '#features/home/warning/Warning'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Warning component', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not render age dialog when confirmation is already valid', () => {
    localStorage.setItem(CONFIRMED_AGE_KEY, String(Date.now()))

    render(<Warning />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('renders age dialog and closes it after confirmation', async () => {
    render(<Warning />)

    fireEvent.click(await screen.findByRole('button', { name: 'I am over 18' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(document.body).not.toHaveAttribute('data-scroll-locked')
    expect(document.body).not.toHaveStyle({ pointerEvents: 'none' })
    expect(localStorage.getItem(CONFIRMED_AGE_KEY)).toMatch(/^\d+$/)
  })
})
