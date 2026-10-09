// ClientRouter soft navigation keeps bundled module scripts alive: they execute once and
// pagehide never fires. Islands must therefore mount on every astro:page-load and tear down
// on astro:before-swap, while the DOM they bound to is still attached.
export function bindSoftNavMount(mount: () => (() => void) | null): () => void {
  let teardown: (() => void) | null = null

  const dispose = () => {
    teardown?.()
    teardown = null
  }

  const onPageLoad = () => {
    // Tear down first so a page-load without a preceding before-swap cannot stack mounts.
    dispose()
    teardown = mount()
  }

  document.addEventListener('astro:page-load', onPageLoad)
  document.addEventListener('astro:before-swap', dispose)

  return () => {
    document.removeEventListener('astro:page-load', onPageLoad)
    document.removeEventListener('astro:before-swap', dispose)
    dispose()
  }
}
