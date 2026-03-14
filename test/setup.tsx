import { afterEach } from 'vitest'

const isJsdom = typeof window !== 'undefined' && typeof document !== 'undefined'

if (isJsdom) {
  void import('@testing-library/jest-dom/vitest')
  void import('@testing-library/react').then(({ cleanup }) => {
    afterEach(() => {
      cleanup()
    })
  })
}
