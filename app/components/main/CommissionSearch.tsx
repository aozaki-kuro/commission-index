'use client'

import { useEffect, useMemo, useState } from 'react'

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
  const hasQuery = useMemo(() => normalizeQuery(query).length > 0, [query])

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
    <section className="mt-6 mb-6 space-y-2">
      <label htmlFor="commission-search" className="block text-sm font-medium text-gray-700">
        Search commissions
      </label>
      <div className="flex items-center gap-2">
        <input
          id="commission-search"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Character, file name, illustrator, description..."
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm transition-colors outline-none focus:border-gray-500"
          autoComplete="off"
        />
        {hasQuery ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="text-xs text-gray-500">
        {hasQuery
          ? 'Wildcard supported: use * to match any characters.'
          : 'Search by character, artist, or text. Example: L*cia'}
      </p>
    </section>
  )
}

export default CommissionSearch
