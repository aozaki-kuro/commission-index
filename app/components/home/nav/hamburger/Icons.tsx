import { memo } from 'react'

export const MenuIcon = memo(({ isOpen }: { isOpen: boolean }) => (
  <svg
    className="h-5 w-5 transform transition-transform duration-300"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
  >
    {isOpen ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    ) : (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    )}
  </svg>
))
MenuIcon.displayName = 'MenuIcon'

export const ChevronIcon = memo(({ isExpanded }: { isExpanded: boolean }) => (
  <svg
    className={`h-4 w-4 text-gray-600 transition-transform duration-200 dark:text-gray-300 ${
      isExpanded ? 'rotate-180' : ''
    }`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
))
ChevronIcon.displayName = 'ChevronIcon'

export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.4-4.4" />
    <circle cx="11" cy="11" r="6" strokeWidth="2" />
  </svg>
)
