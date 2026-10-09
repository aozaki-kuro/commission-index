import tailwindcss from '@tailwindcss/vite'
import icon from 'astro-icon'
import { defineConfig, fontProviders } from 'astro/config'
import { assetsPipelineIntegration } from './server/assetsPipelineAstro'
import { DEFAULT_WEB_LOCALE, WEB_LOCALES } from './src/config/locales'

export default defineConfig({
  output: 'static',
  // Persist image cache outside node_modules so it survives dependency reinstalls
  cacheDir: '.astro',
  i18n: {
    defaultLocale: DEFAULT_WEB_LOCALE,
    locales: [...WEB_LOCALES],
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
      weights: [400, 600, 700],
      styles: ['normal'],
    },
    {
      provider: fontProviders.local(),
      name: 'Berkeley Mono',
      cssVariable: '--font-berkeley-mono',
      options: {
        variants: [
          {
            weight: 400,
            style: 'normal',
            display: 'swap',
            src: ['./src/assets/fonts/BerkeleyMono-Regular.woff2'],
          },
        ],
      },
    },
  ],

  integrations: [icon(), assetsPipelineIntegration()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      include: ['fuse.js'],
    },
    build: {
      rolldownOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules'))
              return
            if (id.includes('fuse.js'))
              return 'vendor-search'
            return 'vendor'
          },
        },
      },
    },
  },
})
