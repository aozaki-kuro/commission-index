// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountBrowsePopoverClose } from './browsePopoverClose'

function renderPopover() {
  document.body.innerHTML = `
    <div id="search-browse-popover" popover>
      <button type="button" data-browse-term="rooftop">rooftop</button>
      <button type="button" popovertarget="search-browse-popover" popovertargetaction="hide" data-browse-close="true">
        <span>×</span>
      </button>
    </div>
  `
  const popover = document.getElementById('search-browse-popover')!
  popover.hidePopover = vi.fn()
  return popover
}

function stubFullScreen(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches && query === '(width < 48rem)' }))
}

function transitionEnd(target: Element, propertyName: string) {
  const event = new Event('transitionend', { bubbles: true })
  Object.defineProperty(event, 'propertyName', { value: propertyName })
  target.dispatchEvent(event)
}

describe('browsePopoverClose', () => {
  let popover: HTMLElement
  let dispose: () => void

  beforeEach(() => {
    popover = renderPopover()
  })

  afterEach(() => {
    dispose?.()
    vi.useRealTimers()
  })

  it('hides the desktop popover at once', () => {
    stubFullScreen(false)
    const closer = mountBrowsePopoverClose(popover)
    dispose = closer.dispose

    closer.close()

    expect(popover.hidePopover).toHaveBeenCalledOnce()
    expect(popover.hasAttribute('data-closing')).toBe(false)
  })

  it('fades the full-screen panel and hides it when its own opacity transition ends', () => {
    stubFullScreen(true)
    const closer = mountBrowsePopoverClose(popover)
    dispose = closer.dispose

    closer.close()
    expect(popover.hasAttribute('data-closing')).toBe(true)
    expect(popover.hidePopover).not.toHaveBeenCalled()

    // A chip's hover transition bubbling up must not end the fade.
    transitionEnd(popover.querySelector('[data-browse-term]')!, 'opacity')
    transitionEnd(popover, 'transform')
    expect(popover.hidePopover).not.toHaveBeenCalled()

    transitionEnd(popover, 'opacity')
    expect(popover.hidePopover).toHaveBeenCalledOnce()
    expect(popover.hasAttribute('data-closing')).toBe(false)
  })

  it('hides after a fallback delay when no transitionend arrives, and only once', () => {
    vi.useFakeTimers()
    stubFullScreen(true)
    const closer = mountBrowsePopoverClose(popover)
    dispose = closer.dispose

    closer.close()
    closer.close()
    vi.advanceTimersByTime(300)

    expect(popover.hidePopover).toHaveBeenCalledOnce()
  })

  it('routes the X through the fade instead of its popovertarget hide', () => {
    stubFullScreen(true)
    const closer = mountBrowsePopoverClose(popover)
    dispose = closer.dispose
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })

    popover.querySelector('[data-browse-close] span')!.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(popover.hasAttribute('data-closing')).toBe(true)
  })

  it('routes Esc pressed anywhere through the fade', () => {
    stubFullScreen(true)
    const closer = mountBrowsePopoverClose(popover)
    dispose = closer.dispose
    const keydown = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })

    document.body.dispatchEvent(keydown)

    expect(keydown.defaultPrevented).toBe(true)
    expect(popover.hasAttribute('data-closing')).toBe(true)
  })

  it('resets when another path closes the panel mid-fade, and dispose cancels a pending hide', () => {
    vi.useFakeTimers()
    stubFullScreen(true)
    const closer = mountBrowsePopoverClose(popover)
    dispose = closer.dispose

    closer.close()
    popover.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }))
    expect(popover.hasAttribute('data-closing')).toBe(false)

    closer.close()
    closer.dispose()
    vi.advanceTimersByTime(300)

    expect(popover.hidePopover).not.toHaveBeenCalled()
    expect(popover.hasAttribute('data-closing')).toBe(false)
  })
})
