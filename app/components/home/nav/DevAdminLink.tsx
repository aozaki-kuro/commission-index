'use client'

import Link from 'next/link'

const DevAdminLink = () => {
  return (
    <div className="relative flex pl-4 text-gray-700 hover:text-gray-900 dark:text-gray-200 dark:hover:text-white">
      <svg
        viewBox="0 0 24 24"
        className="absolute top-1/2 left-0 h-3 w-3 -translate-x-1 -translate-y-1/2 text-gray-400 transition-all duration-300"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l2.5-2.5a5.8 5.8 0 0 1-7.4 7.4l-6.5 6.5a1.8 1.8 0 1 1-2.5-2.5l6.5-6.5a5.8 5.8 0 0 1 7.4-7.4l-3 3Z"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <Link
        href="/admin"
        className="font-mono text-sm font-bold no-underline transition-colors duration-200"
      >
        Admin
      </Link>
    </div>
  )
}

export default DevAdminLink
