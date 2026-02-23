// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommissionImageNoticeClient from './CommissionImageNoticeClient'
import ProtectedCommissionImage from './ProtectedCommissionImage'

describe('CommissionImageNoticeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('shows and dismisses notice when right clicked and then clicking outside', () => {
    render(
      <>
        <ProtectedCommissionImage
          altText="sample alt"
          resolvedImageSrc="/images/webp/sample.webp"
        />
        <CommissionImageNoticeClient />
      </>,
    )

    const image = screen.getByRole('img', { name: 'sample alt' })
    fireEvent.contextMenu(image.parentElement as HTMLDivElement, { clientX: 30, clientY: 40 })

    expect(screen.getByRole('status')).toHaveTextContent('sample alt')

    fireEvent.pointerDown(document.body, { button: 0 })
    act(() => {
      vi.advanceTimersByTime(180)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('auto-hides the notice after timeout', () => {
    render(
      <>
        <ProtectedCommissionImage
          altText="sample alt"
          resolvedImageSrc="/images/webp/sample.webp"
        />
        <CommissionImageNoticeClient />
      </>,
    )

    const image = screen.getByRole('img', { name: 'sample alt' })
    fireEvent.contextMenu(image.parentElement as HTMLDivElement, { clientX: 30, clientY: 40 })

    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2380)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
