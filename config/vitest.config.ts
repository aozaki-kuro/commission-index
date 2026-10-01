import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const rootDir = resolve(import.meta.dirname, '..')

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      '@layouts': resolve(rootDir, 'apps/web/src/layouts'),
      '@features': resolve(rootDir, 'apps/web/src/features'),
      '@components': resolve(rootDir, 'apps/web/src/components'),
      '@images': resolve(rootDir, 'apps/web/public/images'),
      '@data': resolve(rootDir, 'apps/web/data'),
      '@lib': resolve(rootDir, 'apps/web/src/lib'),
      '@styles': resolve(rootDir, 'apps/web/src/styles'),
      '@config': resolve(rootDir, 'apps/web/src/config'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'apps/*/{src,data,server,test}/**/*.test.{ts,tsx}',
      'packages/*/{src,test}/**/*.test.{ts,tsx}',
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
