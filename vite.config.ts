import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { viteAssetsPipeline } from './scripts/viteAssetsPipeline'

const adminApiPort = Number(process.env.VITE_ADMIN_API_PORT ?? 8788)
const sitePayloadPath = path.resolve(process.cwd(), 'public', 'data', 'site-payload.json')
const homePrerenderPath = path.resolve(process.cwd(), 'public', 'data', 'home-prerender.html')

const injectHomePrerender = () => ({
  name: 'inject-home-prerender',
  apply: 'build' as const,
  async transformIndexHtml(html: string) {
    const [sitePayloadText, homePrerenderText] = await Promise.all([
      readFile(sitePayloadPath, 'utf8').catch(() => null),
      readFile(homePrerenderPath, 'utf8').catch(() => null),
    ])
    if (!sitePayloadText || !homePrerenderText) return html

    const inlinePayloadScript = `<script id="site-payload" type="application/json">${sitePayloadText
      .trim()
      .replace(/</g, '\\u003c')}</script>`
    const withRootPrerender = html.replace(
      /<div id="root"><\/div>/,
      `<div id="root" data-prerendered="home">${homePrerenderText.trim()}</div>`,
    )

    return withRootPrerender.replace('</head>', `    ${inlinePayloadScript}\n  </head>`)
  },
})

export default defineConfig(({ command }) => {
  const isBuild = command === 'build'

  return {
    plugins: [
      viteAssetsPipeline({
        command: isBuild ? 'assets:build' : 'assets:dev',
        watch: !isBuild,
      }),
      injectHomePrerender(),
      react(),
      tsconfigPaths(),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: id => {
            if (!id.includes('node_modules')) return
            if (id.includes('fuse.js')) return 'vendor-search'
            if (id.includes('@dnd-kit')) return 'vendor-admin'
            if (id.includes('@radix-ui') || id.includes('cmdk')) return 'vendor-ui'
            return 'vendor'
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${adminApiPort}`,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
  }
})
