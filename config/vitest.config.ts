import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const rootDir = resolve(import.meta.dirname, '..')

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    setupFiles: [resolve(rootDir, 'apps/web/test/setup.tsx')],
    include: [
      'apps/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.tsx',
      'apps/*/data/**/*.test.ts',
      'apps/*/server/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.tsx',
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'packages/*/test/**/*.test.ts',
      'packages/*/test/**/*.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      'apps/*/test/visual/**',
    ],
    coverage: {
      reportsDirectory: './coverage/vitest',
    },
  },
})
