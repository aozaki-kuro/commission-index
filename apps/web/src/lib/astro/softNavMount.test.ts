// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { bindSoftNavMount } from './softNavMount'

function createMount() {
  const teardown = vi.fn()
  const mount = vi.fn(() => teardown)
  return { mount, teardown }
}

describe('bindSoftNavMount', () => {
  it('mounts on the initial astro:page-load', () => {
    const { mount } = createMount()
    const unbind = bindSoftNavMount(mount)

    document.dispatchEvent(new Event('astro:page-load'))

    expect(mount).toHaveBeenCalledTimes(1)
    unbind()
  })

  it('tears down before the DOM swap', () => {
    const { mount, teardown } = createMount()
    const unbind = bindSoftNavMount(mount)
    document.dispatchEvent(new Event('astro:page-load'))

    document.dispatchEvent(new Event('astro:before-swap'))

    expect(teardown).toHaveBeenCalledTimes(1)
    unbind()
  })

  it('re-mounts on the next page-load after a swap', () => {
    const { mount, teardown } = createMount()
    const unbind = bindSoftNavMount(mount)
    document.dispatchEvent(new Event('astro:page-load'))
    document.dispatchEvent(new Event('astro:before-swap'))

    document.dispatchEvent(new Event('astro:page-load'))

    expect(mount).toHaveBeenCalledTimes(2)
    expect(teardown).toHaveBeenCalledTimes(1)
    unbind()
  })

  it('does not stack mounts when page-load arrives without a before-swap', () => {
    const { mount, teardown } = createMount()
    const unbind = bindSoftNavMount(mount)
    document.dispatchEvent(new Event('astro:page-load'))

    document.dispatchEvent(new Event('astro:page-load'))

    expect(teardown).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledTimes(2)
    unbind()
  })

  it('ignores a mount that returns null', () => {
    const mount = vi.fn(() => null)
    const unbind = bindSoftNavMount(mount)

    expect(() => {
      document.dispatchEvent(new Event('astro:page-load'))
      document.dispatchEvent(new Event('astro:before-swap'))
    }).not.toThrow()
    expect(mount).toHaveBeenCalledTimes(1)
    unbind()
  })

  it('stops listening and tears down when unbound', () => {
    const { mount, teardown } = createMount()
    const unbind = bindSoftNavMount(mount)
    document.dispatchEvent(new Event('astro:page-load'))

    unbind()
    document.dispatchEvent(new Event('astro:page-load'))

    expect(teardown).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledTimes(1)
  })
})
