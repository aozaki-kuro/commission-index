import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.tsx'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'data/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.astro/**'],
  },
})
