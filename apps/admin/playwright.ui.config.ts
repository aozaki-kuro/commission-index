import process from 'node:process'
import { defineConfig } from '@playwright/test'

// 仅启动前端；测试必须拦截全部 Admin API，避免访问 D1/R2。
export default defineConfig({
  testDir: './test/visual',
  testMatch: ['ui-stability.spec.ts', 'aliases-ui.spec.ts'],
  outputDir: '../../test-results/admin-ui',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174 --strictPort',
    cwd: import.meta.dirname,
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
  },
})
