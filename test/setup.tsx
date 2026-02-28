/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react'
import { afterEach, vi } from 'vitest'

const isJsdom = typeof window !== 'undefined' && typeof document !== 'undefined'

if (isJsdom) {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')

  afterEach(() => {
    cleanup()
  })

  vi.mock('next/image', () => ({
    default: ({
      src,
      alt,
      unoptimized,
      ...props
    }: {
      src?: string | { src: string }
      alt?: string
      unoptimized?: boolean
      [key: string]: unknown
    }) => {
      void unoptimized
      const resolvedSrc = typeof src === 'string' ? src : (src?.src ?? '')
      return <img {...props} src={resolvedSrc} alt={alt ?? ''} />
    },
  }))

  vi.mock('next/link', () => ({
    default: ({
      href,
      children,
      ...props
    }: {
      href: string
      children?: ReactNode
      [key: string]: unknown
    }) => (
      <a {...props} href={href}>
        {children}
      </a>
    ),
  }))
}
