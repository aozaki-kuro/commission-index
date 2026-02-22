/* eslint-disable @next/next/no-img-element */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    unoptimized,
    ...props
  }: ComponentProps<'img'> & {
    src?: string | { src: string }
    unoptimized?: boolean
  }) => {
    void unoptimized
    const resolvedSrc = typeof src === 'string' ? src : (src?.src ?? '')
    return <img {...props} src={resolvedSrc} alt={alt ?? ''} />
  },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}))
