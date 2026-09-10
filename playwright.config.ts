import process from 'node:process'
import { defineConfig } from '@playwright/test'

const reuseExistingServer = !process.env.CI

export default defineConfig({
  outputDir: './test-results/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1600 },
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Asia/Shanghai',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'web',
      testDir: './apps/web/test/visual',
      snapshotPathTemplate: './test/visual/apps/web/{testFilePath}-snapshots/{arg}-{platform}{ext}',
      use: {
        baseURL: 'http://127.0.0.1:4173',
      },
    },
    {
      name: 'admin',
      testDir: './apps/admin/test/visual',
      snapshotPathTemplate: './test/visual/apps/admin/{testFilePath}-snapshots/{arg}-{platform}{ext}',
      use: {
        baseURL: 'http://127.0.0.1:4174',
      },
    },
  ],
  webServer: [
    {
      command: 'NODE_ENV=development pnpm -C apps/web run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      timeout: 120_000,
      reuseExistingServer,
    },
    {
      command: 'pnpm -C apps/admin-worker run dev -- --ip 127.0.0.1 --port 8787',
      url: 'http://127.0.0.1:8787/api/admin/health',
      timeout: 120_000,
      reuseExistingServer,
    },
    {
      // Admin visuals depend on worker-backed bootstrap data, not the legacy web stub.
      command: 'ADMIN_API_BASE_URL=http://127.0.0.1:8787 pnpm -C apps/admin run dev',
      url: 'http://127.0.0.1:4174',
      timeout: 120_000,
      reuseExistingServer,
    },
  ],
})
