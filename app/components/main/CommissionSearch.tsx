'use client'

import { Input } from '@headlessui/react'
import Fuse from 'fuse.js'
import { useEffect, useRef, useState } from 'react'

const normalizeQuery = (value: string) => value.trim().toLowerCase()

type SearchEntry = {
  id: number
  element: HTMLElement
  sectionId: string | undefined
  searchText: string
}

type MatchTerm = (term: string) => Set<number>

const cloneSet = (set: Set<number>) => new Set(set)
const unionSets = (left: Set<number>, right: Set<number>) => new Set([...left, ...right])
const intersectSets = (left: Set<number>, right: Set<number>) => {
  const result = new Set<number>()
  for (const value of left) {
    if (right.has(value)) result.add(value)
  }
  return result
}
const subtractSets = (left: Set<number>, right: Set<number>) => {
  const result = new Set<number>()
  for (const value of left) {
    if (!right.has(value)) result.add(value)
  }
  return result
}

const buildTermMatcher = (entries: SearchEntry[]): MatchTerm => {
  const allIds = new Set(entries.map(entry => entry.id))
  const fuse = new Fuse(entries, {
    keys: ['searchText'],
    threshold: 0.3,
    ignoreLocation: true,
    includeScore: false,
    minMatchCharLength: 1,
  })
  const cache = new Map<string, Set<number>>()

  return term => {
    const normalized = normalizeQuery(term)
    if (!normalized) return cloneSet(allIds)
    const cached = cache.get(normalized)
    if (cached) return cloneSet(cached)

    const matched = new Set(fuse.search(normalized).map(result => result.item.id))
    cache.set(normalized, matched)
    return cloneSet(matched)
  }
}

type QueryToken =
  | { type: 'term'; value: string }
  | { type: 'and' | 'or' | 'not' | 'lparen' | 'rparen' }

const tokenizeQuery = (query: string): QueryToken[] => {
  const rawTokens = query.match(/\(|\)|&&|\|\||!|[^\s()]+/g) ?? []
  const tokens: QueryToken[] = rawTokens.map(raw => {
    const upper = raw.toUpperCase()
    if (raw === '(') return { type: 'lparen' }
    if (raw === ')') return { type: 'rparen' }
    if (upper === 'AND' || raw === '&&') return { type: 'and' }
    if (upper === 'OR' || raw === '||') return { type: 'or' }
    if (upper === 'NOT' || raw === '!') return { type: 'not' }
    return { type: 'term', value: normalizeQuery(raw) }
  })

  const output: QueryToken[] = []
  const shouldInsertAnd = (prev: QueryToken, current: QueryToken) => {
    const prevIsOperand = prev.type === 'term' || prev.type === 'rparen'
    const currentStartsOperand =
      current.type === 'term' || current.type === 'lparen' || current.type === 'not'
    return prevIsOperand && currentStartsOperand
  }

  for (const token of tokens) {
    const prev = output.at(-1)
    if (prev && shouldInsertAnd(prev, token)) {
      output.push({ type: 'and' })
    }
    output.push(token)
  }

  return output
}

const toRpn = (tokens: QueryToken[]): QueryToken[] | null => {
  const output: QueryToken[] = []
  const operators: QueryToken[] = []

  const precedence = (token: QueryToken) => {
    if (token.type === 'not') return 3
    if (token.type === 'and') return 2
    if (token.type === 'or') return 1
    return 0
  }

  const isOperator = (token: QueryToken) =>
    token.type === 'and' || token.type === 'or' || token.type === 'not'

  for (const token of tokens) {
    if (token.type === 'term') {
      output.push(token)
      continue
    }

    if (token.type === 'lparen') {
      operators.push(token)
      continue
    }

    if (token.type === 'rparen') {
      let foundLParen = false
      while (operators.length > 0) {
        const top = operators.pop()
        if (!top) return null
        if (top.type === 'lparen') {
          foundLParen = true
          break
        }
        output.push(top)
      }
      if (!foundLParen) return null
      continue
    }

    while (operators.length > 0) {
      const top = operators.at(-1)
      if (!top || !isOperator(top)) break

      const shouldPop =
        token.type === 'not'
          ? precedence(top) > precedence(token)
          : precedence(top) >= precedence(token)
      if (!shouldPop) break

      const popped = operators.pop()
      if (!popped) return null
      output.push(popped)
    }

    operators.push(token)
  }

  while (operators.length > 0) {
    const top = operators.pop()
    if (!top || top.type === 'lparen' || top.type === 'rparen') return null
    output.push(top)
  }

  return output
}

const evaluateRpn = (
  matchTerm: MatchTerm,
  universe: Set<number>,
  rpn: QueryToken[],
): Set<number> | null => {
  const stack: Set<number>[] = []

  for (const token of rpn) {
    if (token.type === 'term') {
      stack.push(matchTerm(token.value))
      continue
    }

    if (token.type === 'not') {
      const value = stack.pop()
      if (value === undefined) return null
      stack.push(subtractSets(universe, value))
      continue
    }

    const right = stack.pop()
    const left = stack.pop()
    if (left === undefined || right === undefined) return null

    if (token.type === 'and') stack.push(intersectSets(left, right))
    else if (token.type === 'or') stack.push(unionSets(left, right))
  }

  if (stack.length !== 1) return null
  return stack[0]
}

const matchesQuery = (matchTerm: MatchTerm, allIds: Set<number>, query: string) => {
  const normalized = normalizeQuery(query)
  if (!normalized) return cloneSet(allIds)

  const evaluateFallback = () => {
    const fallbackTokens = normalized.split(/\s+/).filter(Boolean)
    return fallbackTokens.reduce(
      (current, token) => intersectSets(current, matchTerm(token)),
      allIds,
    )
  }

  const rpn = toRpn(tokenizeQuery(normalized))
  if (!rpn) return evaluateFallback()

  const result = evaluateRpn(matchTerm, allIds, rpn)
  if (result === null) return evaluateFallback()

  return result
}

const updateQueryParam = (query: string) => {
  const url = new URL(window.location.href)
  const normalized = normalizeQuery(query)

  if (normalized) {
    url.searchParams.set('q', query)
  } else {
    url.searchParams.delete('q')
  }

  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

const CommissionSearch = () => {
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('q') ?? ''
  })

  const liveRef = useRef<HTMLParagraphElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const normalized = normalizeQuery(query)
    const entryElements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
    )
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
    )
    const entries = entryElements.map((element, index) => ({
      id: index,
      element,
      sectionId: element.dataset.characterSectionId,
      searchText: (element.dataset.searchText ?? '').toLowerCase(),
    }))

    const visibleBySection = new Map<string, number>()
    let matched = 0
    const allIds = new Set(entries.map(entry => entry.id))
    const matchTerm = buildTermMatcher(entries)
    const matchedIds = matchesQuery(matchTerm, allIds, normalized)

    entries.forEach(entry => {
      const isMatch = matchedIds.has(entry.id)

      entry.element.classList.toggle('hidden', !isMatch)

      if (!isMatch) return
      matched += 1

      const sectionId = entry.sectionId
      if (!sectionId) return
      visibleBySection.set(sectionId, (visibleBySection.get(sectionId) ?? 0) + 1)
    })

    sections.forEach(section => {
      const total = Number(section.dataset.totalCommissions ?? '0')
      const sectionMatched = visibleBySection.get(section.id) ?? 0
      const shouldHide = normalized.length > 0 && total > 0 && sectionMatched === 0
      section.classList.toggle('hidden', shouldHide)
    })

    if (liveRef.current) {
      liveRef.current.textContent =
        normalized.length > 0
          ? `Search results: ${matched} of ${entryElements.length} commissions shown.`
          : `Search cleared. Showing all ${entryElements.length} commissions.`
    }
  }, [query])

  useEffect(() => {
    if (typeof window === 'undefined') return
    updateQueryParam(query)
  }, [query])

  const clearSearch = () => {
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <section id="commission-search" className="mt-8 mb-6 flex h-12 items-center justify-end">
      <div className="relative h-11 w-full overflow-hidden border-b border-gray-300/80 bg-transparent text-gray-700 dark:border-gray-700 dark:text-gray-300">
        <svg
          viewBox="0 0 24 24"
          className="absolute top-1/2 left-2.5 h-3.5 w-3.5 shrink-0 -translate-y-1/2 opacity-70"
          fill="none"
          stroke="currentColor"
        >
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
          <circle cx="11" cy="11" r="6" strokeWidth="2" />
        </svg>

        <div className="absolute inset-y-0 right-2 left-8 flex items-center gap-2">
          <label htmlFor="commission-search-input" className="sr-only">
            Search commissions
          </label>

          <Input
            ref={inputRef}
            id="commission-search-input"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search: AND / OR / NOT"
            autoComplete="off"
            aria-label="Search commissions"
            className="w-full origin-[left_center] transform-[scale(0.8)] bg-transparent pr-8 font-mono text-[16px] tracking-[0.01em] outline-none placeholder:text-gray-400"
          />

          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300"
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
                <path strokeWidth="2.2" strokeLinecap="round" d="M6 6l12 12" />
                <path strokeWidth="2.2" strokeLinecap="round" d="M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <p ref={liveRef} aria-live="polite" className="sr-only" />
    </section>
  )
}

export default CommissionSearch
