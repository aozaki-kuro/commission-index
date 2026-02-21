import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedCommissionImage from './ProtectedCommissionImage'

describe('ProtectedCommissionImage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('renders the fallback source when no static image is provided', () => {
    render(
      <ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/webp/sample.webp" />,
    )

    expect(screen.getByRole('img', { name: 'sample alt' })).toHaveAttribute(
      'src',
      '/images/webp/sample.webp',
    )
  })

  it('shows and dismisses notice when right clicked and then clicking outside', () => {
    render(
      <ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/webp/sample.webp" />,
    )

    const image = screen.getAllByRole('img', { name: 'sample alt' })[0]
    const trigger = image.parentElement
    expect(trigger).not.toBeNull()
    fireEvent.contextMenu(trigger as HTMLDivElement, { clientX: 30, clientY: 40 })

    expect(screen.getByRole('status')).toHaveTextContent('sample alt')

    fireEvent.pointerDown(document.body, { button: 0 })
    act(() => {
      vi.advanceTimersByTime(180)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('auto-hides the notice after timeout', () => {
    render(
      <ProtectedCommissionImage altText="sample alt" resolvedImageSrc="/images/webp/sample.webp" />,
    )

    const image = screen.getAllByRole('img', { name: 'sample alt' })[0]
    fireEvent.contextMenu(image.parentElement as HTMLDivElement, { clientX: 30, clientY: 40 })

    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2380)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
