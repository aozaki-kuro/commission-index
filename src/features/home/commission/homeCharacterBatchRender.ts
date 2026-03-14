import type {
  HomeCharacterBatchEntryPayload,
  HomeCharacterBatchPayload,
  HomeCharacterBatchSectionPayload,
} from '#features/home/commission/homeCharacterBatchPayload'

const SECTION_CLASS = 'pb-6'
const TITLE_CLASS = 'group relative mb-2 pt-4'
const TITLE_LINK_CLASS
  = 'ml-2 font-bold text-gray-400 no-underline opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-gray-600'
const EMPTY_STATE_CLASS = 'my-4'
const ENTRY_CLASS = 'pt-4'
const IMAGE_WRAPPER_CLASS
  = 'relative before:pointer-events-none before:absolute before:inset-0 before:animate-pulse before:bg-gray-200/80 before:content-[\'\'] dark:before:bg-gray-700/60'
const IMAGE_NODE_CLASS = 'pointer-events-none relative z-10 block w-full select-none'
const IMAGE_FALLBACK_CLASS
  = 'aspect-1280/525 flex items-center justify-center bg-gray-100 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-300'
const INFO_ROOT_CLASS
  = 'flex w-full flex-wrap items-center gap-y-2 font-mono text-xs text-gray-800 md:text-sm dark:text-gray-300 mt-6 mb-2 md:mt-8 md:mb-4'
const INFO_TIME_LINK_CLASS
  = 'mr-6 select-none text-gray-800 no-underline dark:text-gray-300! md:mr-16'
const INFO_SEPARATOR_CLASS = 'mx-2 select-none md:mx-4'
const LINKS_ROOT_CLASS = 'ml-auto flex grow justify-end gap-2 md:gap-3'
const TEXT_LINK_CLASS = 'select-none underline underline-offset-2'
const INTEREST_BUTTON_CLASS = `${TEXT_LINK_CLASS} inline-flex cursor-pointer appearance-none items-center gap-2.5 border-0 bg-transparent p-0 disabled:cursor-default disabled:no-underline`

function appendTextElement({
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

function renderEntryImage(entry: HomeCharacterBatchEntryPayload) {
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

function renderInterestButton(entry: HomeCharacterBatchEntryPayload) {
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

  const dot = document.createElement('span')
  dot.setAttribute('aria-hidden', 'true')
  dot.className = 'h-1.5 w-1.5 rounded-full bg-current opacity-80'
  button.append(dot)

  const label = document.createElement('span')
  label.dataset.commissionInterestLabel = ''
  label.textContent = interest.label
  button.append(label)

  return button
}

function renderEntryInfo(entry: HomeCharacterBatchEntryPayload) {
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

  if (entry.links.length > 0) {
    entry.links.forEach((link) => {
      const anchor = document.createElement('a')
      anchor.href = link.url
      anchor.target = '_blank'
      anchor.className = TEXT_LINK_CLASS
      anchor.textContent = link.label
      links.append(anchor)
    })
  }
  else {
    const interestButton = renderInterestButton(entry)
    if (interestButton) {
      links.append(interestButton)
    }
  }

  root.append(links)
  return root
}

function renderEntry(entry: HomeCharacterBatchEntryPayload) {
  const root = document.createElement('div')
  root.id = entry.id
  root.className = ENTRY_CLASS
  root.dataset.commissionEntry = 'true'
  root.dataset.characterSectionId = entry.sectionId
  root.dataset.commissionSearchKey = entry.searchKey
  root.dataset.searchText = entry.searchText
  root.dataset.searchSuggest = entry.searchSuggest
  root.append(renderEntryImage(entry))
  root.append(renderEntryInfo(entry))
  return root
}

function renderSection(section: HomeCharacterBatchSectionPayload) {
  const root = document.createElement('div')
  root.id = section.sectionId
  root.dataset.characterSection = 'true'
  root.dataset.characterStatus = section.status
  root.dataset.totalCommissions = String(section.totalCommissions)
  root.className = SECTION_CLASS

  const title = document.createElement('h2')
  title.id = section.titleId
  title.className = TITLE_CLASS
  title.append(document.createTextNode(section.displayName))

  const anchor = document.createElement('a')
  anchor.href = section.sectionHash
  anchor.className = TITLE_LINK_CLASS
  anchor.textContent = '#'
  title.append(anchor)
  root.append(title)

  if (section.entries.length === 0) {
    const emptyState = document.createElement('p')
    emptyState.className = EMPTY_STATE_CLASS
    emptyState.textContent = section.toBeAnnouncedText
    root.append(emptyState)
    return root
  }

  section.entries.forEach((entry) => {
    root.append(renderEntry(entry))
  })

  return root
}

export function renderHomeCharacterBatchPayload(payload: HomeCharacterBatchPayload) {
  const fragment = document.createDocumentFragment()
  payload.sections.forEach((section) => {
    fragment.append(renderSection(section))
  })
  return fragment
}
