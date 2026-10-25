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
}

function sectionHasNoAvailableCommission(section: HTMLElement) {
  const rawTotalCommissions = section.dataset.totalCommissions
  if (rawTotalCommissions === undefined)
    return false

  const totalCommissions = Number(rawTotalCommissions)
  return Number.isFinite(totalCommissions) && totalCommissions <= 0
}

function setLinkDisabledState(link: HTMLAnchorElement, disabled: boolean) {
  const alreadyDisabled = link.getAttribute('aria-disabled') === 'true'
  if (disabled === alreadyDisabled)
    return

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

export function syncHiddenSectionLinkAvailability({
  root,
  linkSelector,
  getSectionId,
}: SyncHiddenSectionLinkAvailabilityOptions) {
  const links = root.querySelectorAll<HTMLAnchorElement>(linkSelector)
  const sectionById = new Map<string, HTMLElement | null>()

  for (const link of links) {
    const sectionId = getSectionId(link)
    const section
      = sectionId === null
        ? null
        : (sectionById.get(sectionId)
          ?? (() => {
            const resolved = document.getElementById(sectionId)
            sectionById.set(sectionId, resolved)
            return resolved
          })())
    const isDisabled
      = !section || section.classList.contains('hidden') || sectionHasNoAvailableCommission(section)
    setLinkDisabledState(link, isDisabled)
  }
}
