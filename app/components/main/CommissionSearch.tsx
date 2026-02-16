'use client'

import { Input } from '@headlessui/react'
import { useEffect, useRef, useState } from 'react'

const normalizeQuery = (value: string) => value.trim().toLowerCase()
const normalizeFuzzyToken = (value: string) =>
  normalizeQuery(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
const normalizeMaskedPattern = (value: string) =>
  normalizeQuery(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}*]+/gu, '')
const FUZZY_SUBSEQUENCE_MIN_QUERY_LENGTH = 4
const FUZZY_SUBSEQUENCE_MAX_LENGTH_DELTA = 2

const isSubsequence = (needle: string, haystack: string) => {
  if (!needle) return true
  let needleIndex = 0

  for (const char of haystack) {
    if (char === needle[needleIndex]) {
      needleIndex += 1
      if (needleIndex === needle.length) return true
    }
  }

  return false
}

const isMaskedPatternPrefixMatch = (pattern: string, query: string) => {
  if (!pattern.includes('*')) return false
  if (!query) return true

  let queryIndex = 0

  for (
    let patternIndex = 0;
    patternIndex < pattern.length && queryIndex < query.length;
    patternIndex += 1
  ) {
    const patternChar = pattern[patternIndex]
    if (patternChar === '*') {
      queryIndex += 1
      continue
    }

    if (patternChar !== query[queryIndex]) return false
    queryIndex += 1
  }

  return queryIndex === query.length
}

const shouldUseSubsequenceMatch = (query: string, term: string) =>
  query.length >= FUZZY_SUBSEQUENCE_MIN_QUERY_LENGTH &&
  term.length <= query.length + FUZZY_SUBSEQUENCE_MAX_LENGTH_DELTA &&
  term[0] === query[0]

const matchesToken = (searchText: string, token: string) => {
  const normalizedToken = normalizeFuzzyToken(token)
  if (!normalizedToken) return true

  const rawTerms = searchText.split(/\s+/).filter(Boolean)
  const normalizedTerms = rawTerms.map(normalizeFuzzyToken).filter(Boolean)
  if (normalizedTerms.some(term => term.includes(normalizedToken))) return true

  if (
    normalizedTerms.some(
      term =>
        shouldUseSubsequenceMatch(normalizedToken, term) && isSubsequence(normalizedToken, term),
    )
  ) {
    return true
  }

  return rawTerms
    .map(normalizeMaskedPattern)
    .some(pattern => isMaskedPatternPrefixMatch(pattern, normalizedToken))
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

const evaluateRpn = (searchText: string, rpn: QueryToken[]): boolean | null => {
  const stack: boolean[] = []

  for (const token of rpn) {
    if (token.type === 'term') {
      stack.push(matchesToken(searchText, token.value))
      continue
    }

    if (token.type === 'not') {
      const value = stack.pop()
      if (value === undefined) return null
      stack.push(!value)
      continue
    }

    const right = stack.pop()
    const left = stack.pop()
    if (left === undefined || right === undefined) return null

    if (token.type === 'and') stack.push(left && right)
    else if (token.type === 'or') stack.push(left || right)
  }

  if (stack.length !== 1) return null
  return stack[0]
}

const matchesQuery = (searchText: string, query: string) => {
  const normalized = normalizeQuery(query)
  if (!normalized) return true

  const evaluateFallback = () => {
    const fallbackTokens = normalized.split(/\s+/).filter(Boolean)
    return fallbackTokens.every(token => matchesToken(searchText, token))
  }

  const rpn = toRpn(tokenizeQuery(normalized))
  if (!rpn) return evaluateFallback()

  const result = evaluateRpn(searchText, rpn)
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
    const entries = Array.from(
      document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
    )
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
    )

    const visibleBySection = new Map<string, number>()
    let matched = 0

    entries.forEach(entry => {
      const searchText = (entry.dataset.searchText ?? '').toLowerCase()
      const sectionId = entry.dataset.characterSectionId
      const isMatch = normalized.length === 0 || matchesQuery(searchText, normalized)

      entry.classList.toggle('hidden', !isMatch)

      if (!isMatch) return
      matched += 1

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
          ? `Search results: ${matched} of ${entries.length} commissions shown.`
          : `Search cleared. Showing all ${entries.length} commissions.`
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
