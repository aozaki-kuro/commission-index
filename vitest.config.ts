import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.tsx'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'data/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.astro/**'],
  },
})
