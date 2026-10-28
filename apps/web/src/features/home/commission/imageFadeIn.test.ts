// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mountImageFadeIn } from './imageFadeIn'

function setup(complete: boolean) {
  document.body.innerHTML = '<div data-commission-image="true"><img alt="a" /></div><img id="outside" alt="b" />'
  const wrapper = document.querySelector<HTMLElement>('[data-commission-image]')!
  const img = wrapper.querySelector('img')!
  Object.defineProperty(img, 'complete', { configurable: true, value: complete })
  return {
    wrapper,
    img,
    outside: document.getElementById('outside')!,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  delete document.documentElement.dataset.imageFade
})

describe('mountImageFadeIn', () => {
  it('marks already-complete images before enabling the fade', () => {
    const { wrapper } = setup(true)
    const dispose = mountImageFadeIn()
    expect(wrapper.hasAttribute('data-loaded')).toBe(true)
    expect(document.documentElement.dataset.imageFade).toBe('on')
    dispose()
  })

  it('leaves pending images unmarked until they load', () => {
    const { wrapper } = setup(false)
    const dispose = mountImageFadeIn()
    expect(wrapper.hasAttribute('data-loaded')).toBe(false)
    dispose()
  })

  it('marks the wrapper on a load event', () => {
    const { wrapper, img } = setup(false)
    const dispose = mountImageFadeIn()
    img.dispatchEvent(new Event('load'))
    expect(wrapper.hasAttribute('data-loaded')).toBe(true)
    dispose()
  })

  it('marks the wrapper on an error event', () => {
    const { wrapper, img } = setup(false)
    const dispose = mountImageFadeIn()
    img.dispatchEvent(new Event('error'))
    expect(wrapper.hasAttribute('data-loaded')).toBe(true)
    dispose()
  })

  it('ignores load events from images outside a commission wrapper', () => {
    const { wrapper, outside } = setup(false)
    const dispose = mountImageFadeIn()
    outside.dispatchEvent(new Event('load'))
    expect(wrapper.hasAttribute('data-loaded')).toBe(false)
    dispose()
  })

  it('dispose stops marking', () => {
    const { wrapper, img } = setup(false)
    mountImageFadeIn()()
    img.dispatchEvent(new Event('load'))
    expect(wrapper.hasAttribute('data-loaded')).toBe(false)
  })
})
