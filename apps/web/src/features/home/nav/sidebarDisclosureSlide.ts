// Mirrors --ease-enter / --ease-exit in globals.css: the open uses the 240ms enter token, the close a quick exit.
const OPEN_MS = 240
const CLOSE_MS = 120
const OPEN_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const CLOSE_EASING = 'ease-in'

const CLIP_SELECTOR = '[data-sidebar-disclosure-clip]'

export interface SidebarDisclosureSlide {
  setOpen: (open: boolean) => void
  dispose: () => void
}

/**
 * Slides a sidebar `<details>` open and shut with transform/opacity only: WebKit runs a height or grid-row transition
 * on the main thread and lays out every frame. `open` flips at once (so `toggle`, the chevron and find-in-page see the
 * real state); `data-closing` keeps a closing list rendered until its slide settles.
 */
export function mountSidebarDisclosureSlide(
  details: HTMLDetailsElement,
  { win = window }: { win?: Window } = {},
): SidebarDisclosureSlide {
  const summary = details.querySelector<HTMLElement>(':scope > summary')
  const clip = details.querySelector<HTMLElement>(`:scope > ${CLIP_SELECTOR}`)
  const content = clip?.firstElementChild
  let settleSlide: (() => void) | null = null

  const canSlide = () => typeof details.animate === 'function'
    && typeof CSS !== 'undefined'
    && CSS.supports('selector(::details-content)')
    && !win.matchMedia('(prefers-reduced-motion: reduce)').matches

  const setOpen = (open: boolean) => {
    settleSlide?.()
    if (details.open === open)
      return
    if (!clip || !(content instanceof HTMLElement) || !canSlide()) {
      details.open = open
      return
    }

    if (!open)
      details.setAttribute('data-closing', '')
    details.open = open
    // Both ends are measured on the open layout: the list is laid out for the whole slide and collapses at settle.
    const height = clip.getBoundingClientRect().height
    const followers = [] as HTMLElement[]
    for (let node = details.nextElementSibling; node; node = node.nextElementSibling) {
      if (node instanceof HTMLElement)
        followers.push(node)
    }

    const shut = { transform: `translateY(${-height}px)` }
    const counterShut = { transform: `translateY(${height}px)` }
    const rest = { transform: 'none' }
    const clipShut = { ...shut, opacity: 0 }
    const clipRest = { ...rest, opacity: 1 }
    const timing: KeyframeAnimationOptions = open
      ? { duration: OPEN_MS, easing: OPEN_EASING, fill: 'forwards' }
      : { duration: CLOSE_MS, easing: CLOSE_EASING, fill: 'forwards' }
    const frames = (closed: Keyframe, opened: Keyframe) => open
      ? [closed, opened]
      : [opened, closed]
    // The clip box moves while the content counter-moves and holds still, so the list is revealed like a growing
    // height without laying anything out.
    const animations = [
      clip.animate(frames(clipShut, clipRest), timing),
      content.animate(frames(counterShut, rest), timing),
      ...followers.map(node => node.animate(frames(shut, rest), timing)),
    ]

    const settle = () => {
      if (settleSlide !== settle)
        return
      settleSlide = null
      details.removeAttribute('data-closing')
      animations.forEach(animation => animation.cancel())
    }
    settleSlide = settle
    // The finished promises resolve before the frame renders, so the collapse and the cancel paint together.
    void Promise.all(animations.map(animation => animation.finished)).then(settle, () => {})
  }

  const onSummaryClick = (event: MouseEvent) => {
    event.preventDefault()
    setOpen(!details.open)
  }

  summary?.addEventListener('click', onSummaryClick)

  return {
    setOpen,
    dispose: () => {
      summary?.removeEventListener('click', onSummaryClick)
      settleSlide?.()
    },
  }
}
