import type { BatchEntryPayload } from './batchPayload'
import { createUnpublishedInterestIconElement } from '@features/home/commission/unpublishedInterestIcon'

export const SECTION_CLASS = 'pb-6'
export const TITLE_LINK_CLASS
  = 'ml-2 font-bold text-gray-400 no-underline opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none dark:text-gray-600'
export const ENTRY_CLASS = 'pt-6'
export const IMAGE_WRAPPER_CLASS
  = 'relative before:pointer-events-none before:absolute before:inset-0 before:animate-pulse before:bg-gray-200/80 before:content-[\'\'] dark:before:bg-gray-700/60'
export const IMAGE_NODE_CLASS = 'pointer-events-none relative z-10 block w-full select-none'
export const IMAGE_FALLBACK_CLASS
  = 'aspect-1280/525 flex items-center justify-center bg-gray-100 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-300'
export const INFO_ROOT_CLASS
  = 'flex w-full flex-wrap items-center gap-y-2 font-mono text-xs text-gray-800 md:text-sm dark:text-gray-300 mt-6 mb-2 md:mt-8 md:mb-4'
export const INFO_TIME_LINK_CLASS
  = 'mr-6 select-none text-gray-800 no-underline dark:text-gray-300! md:mr-10'
export const INFO_SEPARATOR_CLASS = 'mx-2 select-none md:mx-4'
export const LINKS_ROOT_CLASS = 'ml-auto flex grow justify-end gap-2 md:gap-3'
export const TEXT_LINK_CLASS = 'select-none underline underline-offset-2'
export const INTEREST_BUTTON_CLASS = `${TEXT_LINK_CLASS} inline-flex appearance-none items-center gap-2 border-0 bg-transparent p-0 disabled:cursor-default disabled:no-underline`

export function appendTextElement({
  parent,
  tagName,
  text,
}: {
  parent: HTMLElement
  tagName: 'p' | 'span'
  text: string
}) {
  const element = document.createElement(tagName)
  element.textContent = text
  parent.append(element)
  return element
}

export function renderEntryImage(entry: BatchEntryPayload) {
  const wrapper = document.createElement('div')
  wrapper.dataset.commissionImage = 'true'
  wrapper.dataset.commissionAlt = entry.altText

  if (!entry.image) {
    wrapper.className = 'relative'
    const fallback = document.createElement('div')
    fallback.className = IMAGE_FALLBACK_CLASS
    fallback.textContent = entry.sourceImageNotFoundText
    wrapper.append(fallback)
    return wrapper
  }

  wrapper.className = IMAGE_WRAPPER_CLASS

  const image = document.createElement('img')
  image.dataset.commissionImageNode = 'true'
  image.src = entry.image.src
  image.srcset = entry.image.srcSet
  image.alt = entry.altText
  image.sizes = entry.image.sizes
  image.loading = 'lazy'
  image.decoding = 'async'
  image.width = entry.image.width
  image.height = entry.image.height
  image.style.height = 'auto'
  image.className = IMAGE_NODE_CLASS
  wrapper.append(image)

  return wrapper
}

export function renderInterestButton(entry: BatchEntryPayload) {
  const interest = entry.interest
  if (!interest)
    return null

  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-pressed', 'false')
  button.dataset.linkStyle = 'true'
  button.dataset.commissionInterestKey = interest.key
  button.dataset.commissionInterestRecordedLabel = interest.recordedLabel
  button.dataset.commissionInterestRecordedTitle = interest.recordedTitle
  button.className = INTEREST_BUTTON_CLASS
  button.title = interest.title

  button.append(createUnpublishedInterestIconElement({ state: 'default' }))
  button.append(createUnpublishedInterestIconElement({ state: 'recorded', hidden: true }))

  const label = document.createElement('span')
  label.dataset.commissionInterestLabel = ''
  label.textContent = interest.label
  button.append(label)

  return button
}

export function renderEntryInfo(entry: BatchEntryPayload) {
  const root = document.createElement('div')
  root.className = INFO_ROOT_CLASS

  const lead = document.createElement('div')
  lead.className = 'flex items-center'

  const anchor = document.createElement('a')
  anchor.href = `#${entry.id}`
  anchor.className = INFO_TIME_LINK_CLASS
  const time = document.createElement('time')
  time.textContent = entry.timeLabel
  anchor.append(time)
  lead.append(anchor)

  appendTextElement({ parent: lead, tagName: 'span', text: entry.primaryText })

  if (entry.secondaryText) {
    const separator = document.createElement('span')
    separator.className = INFO_SEPARATOR_CLASS
    separator.textContent = '|'
    lead.append(separator)
    appendTextElement({ parent: lead, tagName: 'span', text: entry.secondaryText })
  }

  root.append(lead)

  const links = document.createElement('div')
  links.className = LINKS_ROOT_CLASS

  entry.links.forEach((link) => {
    const anchor = document.createElement('a')
    anchor.href = link.url
    anchor.target = '_blank'
    anchor.className = TEXT_LINK_CLASS
    anchor.textContent = link.label
    links.append(anchor)
  })

  const interestButton = renderInterestButton(entry)
  if (interestButton) {
    links.append(interestButton)
  }

  root.append(links)
  return root
}

export function renderEntry(entry: BatchEntryPayload) {
  const root = document.createElement('div')
  root.id = entry.id
  root.className = ENTRY_CLASS
  root.dataset.commissionEntry = 'true'
  root.dataset.characterSectionId = entry.sectionId
  root.dataset.commissionSearchKey = entry.searchKey
  root.dataset.searchText = entry.searchText
  root.dataset.searchSuggest = entry.searchSuggest
  if (entry.legacyAnchorId) {
    const legacyAnchor = document.createElement('span')
    legacyAnchor.id = entry.legacyAnchorId
    legacyAnchor.className = 'sr-only'
    legacyAnchor.setAttribute('aria-hidden', 'true')
    root.append(legacyAnchor)
  }
  root.append(renderEntryImage(entry))
  root.append(renderEntryInfo(entry))
  return root
}
