const DISABLED_SECTION_LINK_CLASSES = [
  'pointer-events-none',
  'cursor-not-allowed',
  'opacity-70',
  'text-gray-500',
  'dark:text-gray-400',
] as const

interface SyncHiddenSectionLinkAvailabilityOptions {
  root: ParentNode
  linkSelector: string
  getSectionId: (link: HTMLAnchorElement) => string | null
  isDeferredTarget?: (sectionId: string, link: HTMLAnchorElement) => boolean
}

const setLinkDisabledState = (link: HTMLAnchorElement, disabled: boolean) => {
  if (disabled) {
    link.setAttribute('aria-disabled', 'true')
    link.tabIndex = -1
    link.classList.add(...DISABLED_SECTION_LINK_CLASSES)
    return
  }

  link.removeAttribute('aria-disabled')
  link.removeAttribute('tabindex')
  link.classList.remove(...DISABLED_SECTION_LINK_CLASSES)
}

export const syncHiddenSectionLinkAvailability = ({
  root,
  linkSelector,
  getSectionId,
  isDeferredTarget,
}: SyncHiddenSectionLinkAvailabilityOptions) => {
  const links = root.querySelectorAll<HTMLAnchorElement>(linkSelector)

  for (const link of links) {
    const sectionId = getSectionId(link)
    const section = sectionId ? document.getElementById(sectionId) : null
    const isDisabled =
      !section && sectionId
        ? !isDeferredTarget?.(sectionId, link)
        : !section || section.classList.contains('hidden')
    setLinkDisabledState(link, isDisabled)
  }
}
