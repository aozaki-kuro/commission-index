/**
 * Fades commission images in once they finish loading.
 *
 * Hiding is gated on `html[data-image-fade=on]`, which is only set after this
 * module has marked already-complete images — so without JS (or on a cached
 * reload) nothing is ever transparent.
 */

const WRAPPER_SELECTOR = '[data-commission-image]'
const LOADED_ATTR = 'data-loaded'

interface MountImageFadeInOptions {
  win?: Window
  doc?: Document
}

export function mountImageFadeIn({ doc = document }: MountImageFadeInOptions = {}): () => void {
  for (const wrapper of doc.querySelectorAll<HTMLElement>(WRAPPER_SELECTOR)) {
    const img = wrapper.querySelector('img')
    if (img?.complete) {
      wrapper.setAttribute(LOADED_ATTR, '')
    }
  }
  doc.documentElement.dataset.imageFade = 'on'

  // load/error do not bubble, so capture is the only way to observe them from the document.
  const markLoaded = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    // An errored image must not stay invisible; its alt text and skeleton remain.
    target.closest(WRAPPER_SELECTOR)?.setAttribute(LOADED_ATTR, '')
  }
  doc.addEventListener('load', markLoaded, true)
  doc.addEventListener('error', markLoaded, true)

  return () => {
    doc.removeEventListener('load', markLoaded, true)
    doc.removeEventListener('error', markLoaded, true)
  }
}
