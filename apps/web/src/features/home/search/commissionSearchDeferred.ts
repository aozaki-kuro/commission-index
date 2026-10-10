import type { CommissionSearchEntrySource, SearchSuggestionAliasGroup } from '@features/home/search/commissionSearchIndex'
import {
  fetchFreshHomeCharacterBatchManifest,
  readHomeCharacterBatchManifest,
} from '@features/home/commission/batch/homeCharacterBatchManifest'
import {
  ACTIVE_CHARACTERS_LOADED_EVENT,
  requestActiveCharactersLoad,
} from '@features/home/commission/loader/activeCharactersEvent'
import {
  ARCHIVED_CHARACTERS_LOADED_EVENT,
  requestArchivedCharactersLoad,
} from '@features/home/commission/loader/archivedCharactersEvent'
import {
  buildPopularKeywordPoolFromSuggestTexts,
  dedupeKeywords,
} from '@lib/search/popularKeywords'

export { dedupeKeywords }

export const MAX_FEATURED_KEYWORDS = 6
export const MAX_VISIBLE_POPULAR_KEYWORDS = 6
export const COMMISSION_ENTRY_SELECTOR = '[data-commission-entry="true"]'
export const SHUFFLE_DEFERRED_LOAD_TIMEOUT_MS = 8000

// Probability of picking from the active pool when both pools are non-empty
export const ACTIVE_WEIGHT = 0.75

export function buildHomeSearchIndexUrl() {
  const manifest = readHomeCharacterBatchManifest(
    typeof document !== 'undefined' ? document : undefined,
  )
  const v = manifest?.v
  // Falls back to unversioned URL in SSR/test environments or when the manifest has no v field.
  return v ? `/search/home-search-entries.${v}.json` : '/search/home-search-entries.json'
}

let cachedHomeSearchEntries: CommissionSearchEntrySource[] | null = null
let homeSearchEntriesPromise: Promise<CommissionSearchEntrySource[]> | null = null

interface HomeSearchEntryPayload {
  publicId: string
  domKey: string
  searchText: string
  searchSuggest?: string
}

const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function parseHomeSearchEntries(value: unknown): CommissionSearchEntrySource[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Search index has an invalid entries list.')
  }

  return value.map((entry, id) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError('Search index has an invalid entry.')
    }
    const payload = entry as Partial<HomeSearchEntryPayload>
    if (
      typeof payload.publicId !== 'string'
      || !PUBLIC_ID_PATTERN.test(payload.publicId)
      || Object.hasOwn(payload, 'id')
      || typeof payload.domKey !== 'string'
      || typeof payload.searchText !== 'string'
      || (payload.searchSuggest !== undefined && typeof payload.searchSuggest !== 'string')
    ) {
      throw new TypeError('Search index has an invalid public commission identity or entry data.')
    }

    return {
      id,
      publicId: payload.publicId,
      domKey: payload.domKey,
      searchText: payload.searchText,
      searchSuggest: payload.searchSuggest,
    }
  })
}

export function getCachedHomeSearchEntries() {
  return cachedHomeSearchEntries
}

/**
 * Stale HTML names a hashed search-index file that a deploy replaced. On 404, refresh the manifest
 * and retry once against the current hash rather than failing the search index permanently.
 */
async function loadHomeSearchEntries(): Promise<CommissionSearchEntrySource[]> {
  const response = await fetch(buildHomeSearchIndexUrl())
  if (response.ok) {
    return parseHomeSearchEntries(await response.json())
  }
  if (response.status !== 404) {
    throw new Error(`Failed to load search index: ${response.status}`)
  }

  const freshManifest = await fetchFreshHomeCharacterBatchManifest(
    typeof document !== 'undefined' ? document : undefined,
  )
  const freshVersion = freshManifest?.v
  if (!freshVersion) {
    throw new Error(`Failed to load search index: ${response.status}`)
  }

  const retryResponse = await fetch(`/search/home-search-entries.${freshVersion}.json`)
  if (!retryResponse.ok) {
    throw new Error(`Failed to load search index: ${retryResponse.status}`)
  }
  return parseHomeSearchEntries(await retryResponse.json())
}

export function ensureHomeSearchEntriesPromise() {
  if (cachedHomeSearchEntries) {
    return Promise.resolve(cachedHomeSearchEntries)
  }

  if (!homeSearchEntriesPromise) {
    homeSearchEntriesPromise = loadHomeSearchEntries()
      .then((entries) => {
        cachedHomeSearchEntries = entries
        return entries
      })
      .catch((error) => {
        homeSearchEntriesPromise = null
        throw error
      })
  }

  return homeSearchEntriesPromise
}

export function createSeededRandom(seed: number) {
  let state = seed >>> 0 || 0x6D2B79F5

  return () => {
    state += 0x6D2B79F5
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffleKeywords(keywords: string[], seed: number) {
  const shuffled = [...keywords]
  const random = createSeededRandom(seed)

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return shuffled
}

export function getPopularKeywordBatch(keywords: string[], page: number, batchSize: number) {
  if (keywords.length <= batchSize)
    return keywords

  const seed = (keywords.length * 2654435761 + (page + 1) * 1013904223) >>> 0
  return shuffleKeywords(keywords, seed).slice(0, batchSize)
}

const normalizeKeywordVariantKey = (value: string) => value.trim().toLowerCase()

function collectSearchEntryElementsFromNode(root: ParentNode): HTMLElement[] {
  const directEntries = [...root.querySelectorAll<HTMLElement>(COMMISSION_ENTRY_SELECTOR)]
  const nestedTemplateEntries = [...root.querySelectorAll<HTMLTemplateElement>('template')].flatMap(template => collectSearchEntryElementsFromNode(template.content))

  return [...directEntries, ...nestedTemplateEntries]
}

function buildAliasKeyLookup(aliasGroups: SearchSuggestionAliasGroup[]) {
  const keyToGroup = new Map<string, string>()

  for (const group of aliasGroups) {
    const normalizedTerms = [...[group.term, ...group.aliases]
      .map(term => normalizeKeywordVariantKey(term))
      .filter((term): term is string => Boolean(term))]

    const uniqueTerms = [...new Set(normalizedTerms)]
    if (uniqueTerms.length < 2)
      continue

    const existingGroup = uniqueTerms.map(term => keyToGroup.get(term)).find(Boolean)
    const groupKey = existingGroup ?? uniqueTerms[0]

    for (const term of uniqueTerms) {
      keyToGroup.set(term, groupKey)
    }
  }

  return keyToGroup
}

export function collapseAliasKeywordVariants(keywords: string[], aliasGroups: SearchSuggestionAliasGroup[], seed: number) {
  if (keywords.length === 0 || aliasGroups.length === 0)
    return keywords

  const aliasKeyLookup = buildAliasKeyLookup(aliasGroups)
  if (aliasKeyLookup.size === 0)
    return keywords

  const candidatesByGroup = new Map<string, string[]>()
  const seenCandidateKeysByGroup = new Map<string, Set<string>>()

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeKeywordVariantKey(keyword)
    if (!normalizedKeyword)
      continue
    const groupKey = aliasKeyLookup.get(normalizedKeyword)
    if (!groupKey)
      continue

    let seenKeys = seenCandidateKeysByGroup.get(groupKey)
    if (!seenKeys) {
      seenKeys = new Set<string>()
      seenCandidateKeysByGroup.set(groupKey, seenKeys)
    }
    if (seenKeys.has(normalizedKeyword))
      continue
    seenKeys.add(normalizedKeyword)

    const candidates = candidatesByGroup.get(groupKey) ?? []
    candidates.push(keyword.trim())
    candidatesByGroup.set(groupKey, candidates)
  }

  const selectedTermByGroup = new Map<string, string>()
  const random = createSeededRandom(seed ^ candidatesByGroup.size)
  for (const [groupKey, candidates] of candidatesByGroup) {
    if (candidates.length === 0)
      continue
    if (candidates.length === 1) {
      selectedTermByGroup.set(groupKey, candidates[0])
      continue
    }

    const selectedIndex = Math.floor(random() * candidates.length)
    selectedTermByGroup.set(groupKey, candidates[selectedIndex])
  }

  const collapsedKeywords: string[] = []
  const emittedAliasGroups = new Set<string>()
  const emittedKeywordKeys = new Set<string>()

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeKeywordVariantKey(keyword)
    if (!normalizedKeyword)
      continue

    const groupKey = aliasKeyLookup.get(normalizedKeyword)
    if (!groupKey) {
      if (emittedKeywordKeys.has(normalizedKeyword))
        continue
      emittedKeywordKeys.add(normalizedKeyword)
      collapsedKeywords.push(keyword.trim())
      continue
    }
    if (emittedAliasGroups.has(groupKey))
      continue

    emittedAliasGroups.add(groupKey)
    const selectedTerm = selectedTermByGroup.get(groupKey) ?? keyword.trim()
    const selectedTermKey = normalizeKeywordVariantKey(selectedTerm)
    if (!selectedTermKey || emittedKeywordKeys.has(selectedTermKey))
      continue

    emittedKeywordKeys.add(selectedTermKey)
    collapsedKeywords.push(selectedTerm)
  }

  return collapsedKeywords
}

export function buildSearchEntriesFromDom(): CommissionSearchEntrySource[] {
  if (typeof document === 'undefined')
    return []

  const entriesByKey = new Map<string, Omit<CommissionSearchEntrySource, 'id'>>()
  collectSearchEntryElementsFromNode(document).forEach((element) => {
    const domKey = element.dataset.commissionSearchKey
    const searchText = element.dataset.searchText
    if (!domKey || !searchText || entriesByKey.has(domKey))
      return

    entriesByKey.set(domKey, {
      domKey,
      searchText,
      searchSuggest: element.dataset.searchSuggest,
    })
  })

  return Array.from(entriesByKey.values(), (entry, id) => ({
    id,
    ...entry,
  }))
}

export function buildPopularKeywordPoolFromEntries(entries: CommissionSearchEntrySource[]) {
  return buildPopularKeywordPoolFromSuggestTexts(
    entries
      .map(entry => entry.searchSuggest ?? '')
      .filter((suggestText): suggestText is string => Boolean(suggestText)),
  )
}

function cryptoRandomIndex(length: number) {
  try {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] % length
  }
  catch {
    return Math.floor(Math.random() * length)
  }
}

function extractSectionIdFromDomKey(domKey: string) {
  const separatorIndex = domKey.indexOf('::')
  return separatorIndex > 0 ? domKey.slice(0, separatorIndex) : ''
}

export function pickWeightedEntry<T extends CommissionSearchEntrySource>(
  pool: T[],
): T {
  const manifest = readHomeCharacterBatchManifest(document)
  if (!manifest || pool.length <= 1)
    return pool[cryptoRandomIndex(pool.length)]

  const activeInitial = new Set(manifest.active.initialSectionIds)
  const activeDeferred = manifest.active.targetBatchById
  const active: T[] = []
  const rest: T[] = []

  for (const entry of pool) {
    const sectionId = extractSectionIdFromDomKey(entry.domKey)
    if (sectionId && (activeInitial.has(sectionId) || sectionId in activeDeferred))
      active.push(entry)
    else
      rest.push(entry)
  }

  if (active.length === 0)
    return rest[cryptoRandomIndex(rest.length)]
  if (rest.length === 0)
    return active[cryptoRandomIndex(active.length)]

  const pickActive = cryptoRandomIndex(100) < ACTIVE_WEIGHT * 100
  const chosen = pickActive ? active : rest
  return chosen[cryptoRandomIndex(chosen.length)]
}

export function loadDeferredEntryBatch(sectionId: string): Promise<void> {
  const manifest = readHomeCharacterBatchManifest(document)
  if (!manifest)
    return Promise.reject(new Error('No batch manifest'))

  const isActive = sectionId in manifest.active.targetBatchById
  const isArchived = !isActive && sectionId in manifest.archived.targetBatchById
  if (!isActive && !isArchived)
    return Promise.reject(new Error('Section not found in manifest'))

  const loadedEvent = isActive
    ? ACTIVE_CHARACTERS_LOADED_EVENT
    : ARCHIVED_CHARACTERS_LOADED_EVENT

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timeoutId: number

    const onLoaded = () => {
      if (settled)
        return
      settled = true
      window.clearTimeout(timeoutId)
      window.removeEventListener(loadedEvent, onLoaded)
      resolve()
    }

    timeoutId = window.setTimeout(() => {
      if (settled)
        return
      settled = true
      window.removeEventListener(loadedEvent, onLoaded)
      reject(new Error('Deferred load timeout'))
    }, SHUFFLE_DEFERRED_LOAD_TIMEOUT_MS)

    window.addEventListener(loadedEvent, onLoaded)

    if (isActive) {
      requestActiveCharactersLoad(window, {
        strategy: 'target',
        targetId: sectionId,
      })
    }
    else {
      requestArchivedCharactersLoad(window, {
        strategy: 'target',
        targetId: sectionId,
      })
    }
  })
}

export function scrollAndAnimateEntry(element: HTMLElement) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element.animate(
    [
      { boxShadow: '0 0 0 3px rgba(107,114,128,0.5)' },
      { boxShadow: '0 0 0 12px rgba(107,114,128,0)' },
    ],
    { duration: 1100, easing: 'ease-out' },
  )
}
