import type { AstroVitePlugin } from './server/astroVitePluginType'
import path from 'node:path'
import process from 'node:process'
import react from '@astrojs/react'
import { defineConfig, fontProviders } from 'astro/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { assetsPipelineIntegration } from './server/assetsPipelineAstro'
import { devAdminApiPlugin, devAdminRoutesIntegration } from './server/devAdminAstro'

const SOURCE_IMAGE_PATH_PATTERN = /(?:^|\/)data\/images\/.+\.(?:jpe?g|png)$/

function isSourceImagePath(filePath: string) {
  const normalized = filePath.split(path.sep).join('/').toLowerCase()
  return SOURCE_IMAGE_PATH_PATTERN.test(normalized)
}

function devSourceImageWatchPlugin(): AstroVitePlugin {
  return {
    name: 'dev-source-image-watch',
    apply: 'serve',
    configureServer(server) {
      const triggerReload = (filePath: string) => {
        if (!isSourceImagePath(filePath))
          return

        const relativePath = path.relative(process.cwd(), filePath)
        server.config.logger.info(`[dev-source-image-watch] source image changed: ${relativePath}`)
        server.ws.send({ type: 'full-reload' })
      }

      server.watcher.on('add', triggerReload)
      server.watcher.on('change', triggerReload)
      server.watcher.on('unlink', triggerReload)
    },
  }
}

export default defineConfig({
  output: 'static',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-tw', 'ja'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },

  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'IBM Plex Sans',
      cssVariable: '--font-ibm-plex-sans',
      weights: [400, 600],
      styles: ['normal'],
    },
  ],

  integrations: [react(), assetsPipelineIntegration(), devAdminRoutesIntegration()],
  vite: {
    plugins: [tsconfigPaths(), devAdminApiPlugin(), devSourceImageWatchPlugin()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules'))
              return
            if (id.includes('fuse.js'))
              return 'vendor-search'
            if (id.includes('@radix-ui') || id.includes('cmdk'))
              return 'vendor-ui'
            return 'vendor'
          },
        },
      },
    },
  },
})
