import { defineConfig, fontProviders } from 'astro/config'
import react from '@astrojs/react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { devAdminApiPlugin, devAdminRoutesIntegration } from './server/dev-admin-astro'

export default defineConfig({
  output: 'static',
  experimental: {
    fonts: [
      {
        provider: fontProviders.local(),
        name: 'IBM Plex Sans',
        cssVariable: '--font-ibm-plex-sans',
        weights: [400, 600],
        styles: ['normal'],
        options: {
          variants: [
            {
              weight: 400,
              style: 'normal',
              src: ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'],
            },
            {
              weight: 600,
              style: 'normal',
              src: ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'],
            },
          ],
        },
      },
    ],
  },
  integrations: [react(), devAdminRoutesIntegration()],
  vite: {
    plugins: [tsconfigPaths(), devAdminApiPlugin()],
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
