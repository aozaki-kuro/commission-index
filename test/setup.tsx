import { afterEach } from 'vitest'

const isJsdom = typeof window !== 'undefined' && typeof document !== 'undefined'

if (isJsdom) {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')

  afterEach(() => {
    cleanup()
  })
}
