// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function Probe({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty)
  return null
}

function mount(dirty: boolean) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<Probe dirty={dirty} />))
  return {
    rerender: (next: boolean) => act(() => root.render(<Probe dirty={next} />)),
    unmount: () => act(() => root.unmount()),
  }
}

function fireBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  const preventDefault = vi.spyOn(event, 'preventDefault')
  window.dispatchEvent(event)
  return preventDefault
}

describe('useUnsavedChangesGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prompts only while dirty and stops after the draft becomes clean', () => {
    const view = mount(false)
    expect(fireBeforeUnload()).not.toHaveBeenCalled()

    view.rerender(true)
    expect(fireBeforeUnload()).toHaveBeenCalled()

    view.rerender(false)
    expect(fireBeforeUnload()).not.toHaveBeenCalled()
    view.unmount()
  })

  it('removes its listener on unmount', () => {
    const view = mount(true)
    view.unmount()
    expect(fireBeforeUnload()).not.toHaveBeenCalled()
  })
})
