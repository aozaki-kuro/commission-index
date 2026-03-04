import { defineConfig, fontProviders } from 'astro/config'
import react from '@astrojs/react'
import tsconfigPaths from 'vite-tsconfig-paths'
import {
  devAdminApiPlugin,
  devAdminRoutesIntegration,
  devAssetsPipelinePlugin,
} from './server/dev-admin-astro'

export default defineConfig({
  output: 'static',
  experimental: {
    fonts: [
      {
        provider: fontProviders.fontsource(),
        name: 'IBM Plex Sans',
        cssVariable: '--font-ibm-plex-sans',
        weights: [400, 600],
        styles: ['normal'],
      },
    ],
  },
  integrations: [react(), devAdminRoutesIntegration()],
  vite: {
    plugins: [tsconfigPaths(), devAssetsPipelinePlugin(), devAdminApiPlugin()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: id => {
            if (!id.includes('node_modules')) return
            if (id.includes('fuse.js')) return 'vendor-search'
            if (id.includes('@radix-ui') || id.includes('cmdk')) return 'vendor-ui'
            return 'vendor'
          },
        },
      },
    },
  },
})
