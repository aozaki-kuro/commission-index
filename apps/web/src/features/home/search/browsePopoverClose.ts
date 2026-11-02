// Below this width the browse popover is the full-screen panel (scoped CSS in CommissionSearchIsland.astro).
const FULL_SCREEN_QUERY = '(width < 48rem)'
// The panel fades out in 220ms; hide anyway if no transitionend arrives (a cancelled or skipped transition).
const FADE_FALLBACK_MS = 300

function isOpen(popover: HTMLElement) {
  // Without popover support (jsdom) `:popover-open` never matches; treat it as open so the hide still runs.
  if (typeof popover.showPopover !== 'function')
    return true
  return popover.matches(':popover-open')
}

interface MountBrowsePopoverCloseOptions {
  win?: Window
  doc?: Document
}

// WebKit has no `overlay` and drops a closing popover to `display: none` on its first frame, so the full-screen
// panel's exit transition never shows there. It fades out while still open (`data-closing`) and hides when the fade
// ends. The X, Esc and a term click route through here; the desktop popover hides at once, as before.
export function mountBrowsePopoverClose(
  popover: HTMLElement,
  { win = window, doc = document }: MountBrowsePopoverCloseOptions = {},
) {
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  const reset = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    popover.removeAttribute('data-closing')
  }

  const finish = () => {
    // A native path (light dismiss, an unhandled Esc) may have closed it during the fade; hiding twice throws.
    if (isOpen(popover))
      popover.hidePopover()
    reset()
  }

  const close = () => {
    if (popover.hasAttribute('data-closing') || !isOpen(popover))
      return
    if (!win.matchMedia?.(FULL_SCREEN_QUERY).matches) {
      popover.hidePopover()
      return
    }
    popover.setAttribute('data-closing', '')
    fallbackTimer = setTimeout(finish, FADE_FALLBACK_MS)
  }

  const onTransitionEnd = (event: Event) => {
    // Chip hover transitions bubble up from inside the panel.
    if (event.target === popover && (event as TransitionEvent).propertyName === 'opacity'
      && popover.hasAttribute('data-closing')) {
      finish()
    }
  }

  const onClick = (event: Event) => {
    if (!(event.target as Element).closest('[data-browse-close]'))
      return
    // Cancels the button's popovertarget hide, which would cut the panel on WebKit.
    event.preventDefault()
    close()
  }

  // On the document: opening from a button does not move focus into the panel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen(popover) || !win.matchMedia?.(FULL_SCREEN_QUERY).matches)
      return
    event.preventDefault()
    close()
  }

  const onToggle = (event: Event) => {
    if ((event as ToggleEvent).newState === 'closed')
      reset()
  }

  popover.addEventListener('transitionend', onTransitionEnd)
  popover.addEventListener('click', onClick)
  popover.addEventListener('toggle', onToggle)
  doc.addEventListener('keydown', onKeyDown)

  return {
    close,
    dispose() {
      reset()
      popover.removeEventListener('transitionend', onTransitionEnd)
      popover.removeEventListener('click', onClick)
      popover.removeEventListener('toggle', onToggle)
      doc.removeEventListener('keydown', onKeyDown)
    },
  }
}
