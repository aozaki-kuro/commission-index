import { resolve } from 'node:path'
import process from 'node:process'
import { defineConfig } from '@playwright/test'

const rootDir = resolve(import.meta.dirname, '..')

const reuseExistingServer = !process.env.CI

// The web project always renders the committed fixture (apps/admin-worker/scripts/webVisualFixture.ts), written to a
// git-ignored directory so a real export in apps/web/generated/ is never read or touched. FACT_SOURCE_DIR is relative
// to apps/web. VISUAL_OFFLINE=1 only skips the admin project (it needs the admin Vite server).
const fixtureEnv = 'FACT_SOURCE_DIR=generated-fixture'
const offlineVisual = process.env.VISUAL_OFFLINE === '1'

const webProject = {
  name: 'web',
  testDir: resolve(rootDir, 'apps/web/test/visual'),
  snapshotPathTemplate: resolve(rootDir, 'test/visual/apps/web/{testFilePath}-snapshots/{arg}-{platform}{ext}'),
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
}

const adminProject = {
  name: 'admin',
  testDir: resolve(rootDir, 'apps/admin/test/visual'),
  testMatch: 'admin-*.spec.ts',
  snapshotPathTemplate: resolve(rootDir, 'test/visual/apps/admin/{testFilePath}-snapshots/{arg}-{platform}{ext}'),
  use: {
    baseURL: 'http://127.0.0.1:4174',
  },
}

const webServer = {
  cwd: rootDir,
  command: `${fixtureEnv} node --import tsx apps/admin-worker/scripts/writeOfflineFactSource.ts && ${fixtureEnv} ASTRO_DEV_BACKGROUND=0 pnpm -C apps/web run dev:offline --host 127.0.0.1 --port 4173 --ignore-lock`,
  url: 'http://127.0.0.1:4173',
  timeout: 120_000,
  reuseExistingServer,
}

// Admin visuals are fixture-backed (specs route every /api/admin/** call), so no worker is started.
const adminServers = [
  {
    cwd: rootDir,
    command: 'pnpm -C apps/admin run dev',
    url: 'http://127.0.0.1:4174',
    timeout: 120_000,
    reuseExistingServer,
  },
]

export default defineConfig({
  outputDir: resolve(rootDir, 'test-results/playwright'),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: resolve(rootDir, 'playwright-report') }],
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
  projects: offlineVisual ? [webProject] : [webProject, adminProject],
  webServer: offlineVisual ? [webServer] : [webServer, ...adminServers],
})
