'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const normalizeQuery = (value: string) => value.trim().toLowerCase()
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const splitTerms = (value: string) => value.split(/[\s,./|:;()[\]{}"']+/).filter(Boolean)

const wildcardPrefixMatch = (token: string, wildcardPattern: string) => {
  const t = token.toLowerCase()
  const p = wildcardPattern.toLowerCase()
  const memo = new Map<string, boolean>()

  const dfs = (ti: number, pi: number): boolean => {
    const key = `${ti}:${pi}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    if (ti === t.length) return true
    if (pi === p.length) return false

    let result = false
    if (p[pi] === '*') {
      result = dfs(ti, pi + 1) || dfs(ti + 1, pi)
    } else if (t[ti] === p[pi]) {
      result = dfs(ti + 1, pi + 1)
    }

    memo.set(key, result)
    return result
  }

  return dfs(0, 0)
}

const matchesToken = (searchText: string, token: string) => {
  if (!token) return true

  if (!token.includes('*')) {
    if (searchText.includes(token)) return true

    // Also treat wildcard terms in data (e.g. "l*cia") as match patterns.
    const wildcardTerms = splitTerms(searchText).filter(term => term.includes('*'))
    return wildcardTerms.some(term => wildcardPrefixMatch(token, term))
  }

  const pattern = token
    .split('*')
    .map(part => escapeRegex(part))
    .join('.*')
  const regex = new RegExp(pattern, 'i')

  return regex.test(searchText)
}

const matchesQuery = (searchText: string, query: string) => {
  const tokens = normalizeQuery(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every(token => matchesToken(searchText, token))
}

const CommissionSearch = () => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasQuery = useMemo(() => normalizeQuery(query).length > 0, [query])

  useEffect(() => {
    if (!isOpen) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      if (normalizeQuery(query).length > 0) return
      setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen, query])

  useEffect(() => {
    const normalized = normalizeQuery(query)
    const entries = Array.from(
      document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
    )
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
    )

    const visibleBySection = new Map<string, number>()
    entries.forEach(entry => {
      const searchText = (entry.dataset.searchText ?? '').toLowerCase()
      const sectionId = entry.dataset.characterSectionId
      const isMatch = normalized.length === 0 || matchesQuery(searchText, normalized)

      entry.classList.toggle('hidden', !isMatch)

      if (!isMatch) return

      if (!sectionId) return

      visibleBySection.set(sectionId, (visibleBySection.get(sectionId) ?? 0) + 1)
    })

    sections.forEach(section => {
      const total = Number(section.dataset.totalCommissions ?? '0')
      const sectionMatched = visibleBySection.get(section.id) ?? 0
      const shouldHide = normalized.length > 0 && total > 0 && sectionMatched === 0
      section.classList.toggle('hidden', shouldHide)
    })
  }, [query])

  return (
    <section className="mt-8 mb-6 flex h-11 items-center justify-end">
      <div
        ref={containerRef}
        className={`relative h-10 overflow-hidden rounded-full border border-gray-300 bg-white text-gray-700 shadow-sm transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:ring-2 focus-within:ring-gray-500 focus-within:ring-offset-2 ${
          isOpen ? 'w-full max-w-md' : 'w-32'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="absolute top-1/2 left-3 h-4 w-4 shrink-0 -translate-y-1/2"
          fill="none"
          stroke="currentColor"
        >
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
          <circle cx="11" cy="11" r="6" strokeWidth="2" />
        </svg>

        <div
          className={`absolute inset-y-0 right-2 left-9 flex items-center transition-all duration-200 ${
            isOpen
              ? 'pointer-events-none translate-y-1 opacity-0'
              : 'pointer-events-auto translate-y-0 opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-expanded={isOpen}
            aria-controls="commission-search-input"
            className="inline-flex w-full items-center justify-between gap-2 text-sm focus-visible:outline-none"
            tabIndex={isOpen ? -1 : 0}
          >
            <span>Search</span>
            {hasQuery ? (
              <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs text-white">
                Active
              </span>
            ) : null}
          </button>
        </div>

        <div
          className={`absolute inset-y-0 right-2 left-9 flex items-center gap-2 transition-all duration-200 ${
            isOpen
              ? 'pointer-events-auto translate-y-0 opacity-100'
              : 'pointer-events-none -translate-y-1 opacity-0'
          }`}
        >
          <label htmlFor="commission-search-input" className="sr-only">
            Search commissions
          </label>
          <input
            ref={inputRef}
            id="commission-search-input"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') setIsOpen(false)
            }}
            placeholder="Search (supports * wildcard, e.g. L*cia)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
            autoComplete="off"
            tabIndex={isOpen ? 0 : -1}
          />
        </div>
      </div>
    </section>
  )
}

export default CommissionSearch
