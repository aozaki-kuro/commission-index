import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import { Readable } from 'node:stream'
import tsconfigPaths from 'vite-tsconfig-paths'

const devAdminApiPlugin = () => ({
  name: 'dev-admin-api',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use(async (req, res, next) => {
      const requestPath = req.originalUrl ?? req.url ?? '/'
      const pathname = requestPath.split('?')[0]
      if (!pathname.startsWith('/api/admin/')) {
        next()
        return
      }

      try {
        const { handleAdminApiRequest } = await server.ssrLoadModule('/server/admin-api-handler.ts')
        const host = req.headers.host ?? 'localhost'
        const url = `http://${host}${requestPath}`
        const method = req.method ?? 'GET'
        const body =
          method === 'GET' || method === 'HEAD'
            ? undefined
            : (Readable.toWeb(req) as ReadableStream)
        const requestInit: RequestInit = {
          method,
          headers: req.headers as HeadersInit,
          body,
        }
        if (body) {
          ;(requestInit as RequestInit & { duplex: 'half' }).duplex = 'half'
        }
        const response = await handleAdminApiRequest(new Request(url, requestInit))

        res.statusCode = response.status
        response.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })

        if (!response.body) {
          res.end()
          return
        }

        const bodyBuffer = Buffer.from(await response.arrayBuffer())
        if (!res.hasHeader('content-length')) {
          res.setHeader('content-length', String(bodyBuffer.byteLength))
        }
        res.end(bodyBuffer)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected server error.'
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'error', message }))
      }
    })
  },
})

export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tsconfigPaths(), devAdminApiPlugin()],
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
  },
})
