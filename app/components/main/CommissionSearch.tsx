'use client'

import { Input } from '@headlessui/react'
import Fuse from 'fuse.js'
import { useEffect, useMemo, useRef, useState } from 'react'

const normalize = (s: string) => s.trim().toLowerCase()

type Entry = {
  id: number
  element: HTMLElement
  sectionId?: string
  searchText: string
}

type TokenKind = 'term' | 'and' | 'or' | 'not' | 'lparen' | 'rparen'
type Token = { type: TokenKind; value?: string }

const allIdsOf = (entries: Entry[]) => new Set(entries.map(e => e.id))

const intersect = (a: Set<number>, b: Set<number>) => {
  const out = new Set<number>()
  for (const x of a) if (b.has(x)) out.add(x)
  return out
}

const union = (a: Set<number>, b: Set<number>) => new Set<number>([...a, ...b])

const diff = (a: Set<number>, b: Set<number>) => {
  const out = new Set<number>()
  for (const x of a) if (!b.has(x)) out.add(x)
  return out
}

const updateQueryParam = (rawQuery: string) => {
  const url = new URL(window.location.href)
  if (normalize(rawQuery)) url.searchParams.set('q', rawQuery)
  else url.searchParams.delete('q')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

const precedence = (type: TokenKind) => {
  if (type === 'not') return 3
  if (type === 'and') return 2
  if (type === 'or') return 1
  return 0
}

const isOperator = (t: Token) => t.type === 'and' || t.type === 'or' || t.type === 'not'

const tokenize = (query: string): Token[] => {
  const raw = query.match(/\(|\)|&&|\|\||!|[^\s()]+/g) ?? []
  const base: Token[] = raw.map(part => {
    const u = part.toUpperCase()
    if (part === '(') return { type: 'lparen' }
    if (part === ')') return { type: 'rparen' }
    if (u === 'AND' || part === '&&') return { type: 'and' }
    if (u === 'OR' || part === '||') return { type: 'or' }
    if (u === 'NOT' || part === '!') return { type: 'not' }
    return { type: 'term', value: normalize(part) }
  })

  // 隐式 AND: term/rparen 后面接 term/lparen/not
  const out: Token[] = []
  const startsOperand = (t: Token) => t.type === 'term' || t.type === 'lparen' || t.type === 'not'
  const endsOperand = (t: Token) => t.type === 'term' || t.type === 'rparen'

  for (const t of base) {
    const prev = out[out.length - 1]
    if (prev && endsOperand(prev) && startsOperand(t)) out.push({ type: 'and' })
    out.push(t)
  }
  return out
}

const toRpn = (tokens: Token[]): Token[] | null => {
  const output: Token[] = []
  const ops: Token[] = []

  for (const t of tokens) {
    if (t.type === 'term') {
      output.push(t)
      continue
    }

    if (t.type === 'lparen') {
      ops.push(t)
      continue
    }

    if (t.type === 'rparen') {
      let ok = false
      while (ops.length) {
        const top = ops.pop()!
        if (top.type === 'lparen') {
          ok = true
          break
        }
        output.push(top)
      }
      if (!ok) return null
      continue
    }

    // operator
    while (ops.length) {
      const top = ops[ops.length - 1]
      if (!isOperator(top)) break

      const pop =
        t.type === 'not'
          ? precedence(top.type) > precedence(t.type) // not 右结合
          : precedence(top.type) >= precedence(t.type)

      if (!pop) break
      output.push(ops.pop()!)
    }
    ops.push(t)
  }

  while (ops.length) {
    const top = ops.pop()!
    if (top.type === 'lparen' || top.type === 'rparen') return null
    output.push(top)
  }
  return output
}

const evaluateRpn = (
  rpn: Token[],
  universe: Set<number>,
  matchTerm: (term: string) => Set<number>,
): Set<number> | null => {
  const st: Set<number>[] = []

  for (const t of rpn) {
    if (t.type === 'term') {
      st.push(matchTerm(t.value ?? ''))
      continue
    }

    if (t.type === 'not') {
      const v = st.pop()
      if (!v) return null
      st.push(diff(universe, v))
      continue
    }

    const b = st.pop()
    const a = st.pop()
    if (!a || !b) return null
    st.push(t.type === 'and' ? intersect(a, b) : union(a, b))
  }

  return st.length === 1 ? st[0] : null
}

const CommissionSearch = () => {
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('q') ?? ''
  })

  const inputRef = useRef<HTMLInputElement>(null)
  const liveRef = useRef<HTMLParagraphElement>(null)

  // 1) 静态索引，仅在挂载时构建
  const index = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        entries: [] as Entry[],
        sections: [] as HTMLElement[],
        universe: new Set<number>(),
        matchTerm: (_: string) => new Set<number>(),
      }
    }

    const entryElements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-commission-entry="true"]'),
    )
    const sectionElements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-section="true"]'),
    )

    const entries: Entry[] = entryElements.map((element, id) => ({
      id,
      element,
      sectionId: element.dataset.characterSectionId,
      searchText: (element.dataset.searchText ?? '').toLowerCase(),
    }))

    const universe = allIdsOf(entries)

    const fuse = new Fuse(entries, {
      keys: ['searchText'],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: false,
      minMatchCharLength: 1,
    })

    const cache = new Map<string, Set<number>>()
    const matchTerm = (term: string) => {
      const t = normalize(term)
      if (!t) return new Set(universe)

      const hit = cache.get(t)
      if (hit) return new Set(hit)

      const ids = new Set(fuse.search(t).map(r => r.item.id))
      cache.set(t, ids)
      return new Set(ids)
    }

    return { entries, sections: sectionElements, universe, matchTerm }
  }, [])

  // 2) 执行搜索并刷新 DOM 显示
  useEffect(() => {
    const q = normalize(query)
    const { entries, sections, universe, matchTerm } = index
    if (!entries.length) return

    const fallback = () =>
      q
        .split(/\s+/)
        .filter(Boolean)
        .reduce((acc, t) => intersect(acc, matchTerm(t)), new Set(universe))

    const rpn = q ? toRpn(tokenize(q)) : null
    const matchedIds = !q
      ? new Set(universe)
      : rpn
        ? (evaluateRpn(rpn, universe, matchTerm) ?? fallback())
        : fallback()

    const visibleBySection = new Map<string, number>()
    let matchedCount = 0

    for (const e of entries) {
      const show = matchedIds.has(e.id)
      e.element.classList.toggle('hidden', !show)
      if (!show) continue
      matchedCount += 1
      if (e.sectionId)
        visibleBySection.set(e.sectionId, (visibleBySection.get(e.sectionId) ?? 0) + 1)
    }

    for (const section of sections) {
      const total = Number(section.dataset.totalCommissions ?? '0')
      const shown = visibleBySection.get(section.id) ?? 0
      const hide = !!q && total > 0 && shown === 0
      section.classList.toggle('hidden', hide)
    }

    if (liveRef.current) {
      liveRef.current.textContent = q
        ? `Search results: ${matchedCount} of ${entries.length} commissions shown.`
        : `Search cleared. Showing all ${entries.length} commissions.`
    }
  }, [query, index])

  // 3) 同步 URL 参数
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
            onChange={e => setQuery(e.target.value)}
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
