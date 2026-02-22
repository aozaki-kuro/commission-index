'use client'

import dynamic from 'next/dynamic'
import { startTransition, useCallback, useEffect, useState } from 'react'

const CommissionSearch = dynamic(() => import('#components/home/search/CommissionSearch'))

const hasSearchQueryParam = () => {
  if (typeof window === 'undefined') return false
  return !!new URLSearchParams(window.location.search).get('q')
}

export default function CommissionSearchDeferred() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [shouldFocusOnMount, setShouldFocusOnMount] = useState(false)
  const [shellQuery, setShellQuery] = useState('')

  const enableSearch = useCallback((focusOnMount = false) => {
    startTransition(() => {
      setIsEnabled(true)
      if (focusOnMount) setShouldFocusOnMount(true)
    })
  }, [])

  useEffect(() => {
    if (isEnabled || !hasSearchQueryParam()) return
    enableSearch(false)
  }, [enableSearch, isEnabled])

  if (isEnabled) {
    return (
      <CommissionSearch
        autoFocusOnMount={shouldFocusOnMount}
        deferIndexInit
        initialQuery={shellQuery || undefined}
      />
    )
  }

  return (
    <section id="commission-search" className="mt-8 mb-6 flex h-12 items-center justify-end">
      <div className="relative h-11 w-full overflow-visible border-b border-gray-300/80 bg-transparent text-gray-700 dark:border-gray-700 dark:text-gray-300">
        <svg
          viewBox="0 0 24 24"
          className="absolute top-1/2 left-2.5 h-3.5 w-3.5 shrink-0 -translate-y-1/2 opacity-70"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
          <circle cx="11" cy="11" r="6" strokeWidth="2" />
        </svg>

        <div className="absolute inset-y-0 right-2 left-8 flex items-center gap-2">
          <label htmlFor="commission-search-input" className="sr-only">
            Search commissions
          </label>

          <input
            id="commission-search-input"
            type="search"
            value={shellQuery}
            onFocus={() => enableSearch(true)}
            onPointerDown={() => enableSearch(true)}
            onChange={e => {
              setShellQuery(e.target.value)
              enableSearch(true)
            }}
            placeholder="Search"
            autoComplete="off"
            aria-label="Search commissions"
            className="w-full origin-[left_center] transform-[scale(0.8)] bg-transparent pr-24 font-mono text-[16px] tracking-[0.01em] outline-none placeholder:text-gray-400"
          />

          <button
            type="button"
            onClick={() => enableSearch(true)}
            className="absolute right-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:text-gray-400 dark:hover:text-gray-100 dark:focus-visible:outline-gray-300"
            aria-label="Enable search"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="2" />
              <path
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.6 9.2a2.6 2.6 0 1 1 4.8 1.4c-.6.8-1.4 1.2-2 1.8-.4.4-.6.9-.6 1.6"
              />
              <circle cx="12" cy="17.3" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
