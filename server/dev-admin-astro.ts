import type { AstroIntegration } from 'astro'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'

const ADMIN_API_PREFIX = '/api/admin/'

const toRequest = (req: IncomingMessage, requestPath: string) => {
  const host = req.headers.host ?? 'localhost'
  const url = `http://${host}${requestPath}`
  const method = req.method ?? 'GET'
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream)
  const requestInit: RequestInit = {
    method,
    headers: req.headers as HeadersInit,
    body,
  }

  if (body) {
    ;(requestInit as RequestInit & { duplex: 'half' }).duplex = 'half'
  }

  return new Request(url, requestInit)
}

const writeNodeResponse = async (res: ServerResponse, response: Response) => {
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
}

export const devAdminApiPlugin = (): Plugin => ({
  name: 'dev-admin-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const requestPath = req.originalUrl ?? req.url ?? '/'
      const pathname = requestPath.split('?')[0]
      if (!pathname.startsWith(ADMIN_API_PREFIX)) {
        next()
        return
      }

      try {
        const { handleAdminApiRequest } = await server.ssrLoadModule('/server/admin-api-handler.ts')
        const request = toRequest(req, requestPath)
        const response = await handleAdminApiRequest(request)
        await writeNodeResponse(res, response)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected server error.'
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'error', message }))
      }
    })
  },
})

export const devAdminRoutesIntegration = (): AstroIntegration => ({
  name: 'dev-admin-routes',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return

      injectRoute({
        pattern: '/admin',
        entrypoint: './src/dev-admin/pages/admin-index.astro',
      })
      injectRoute({
        pattern: '/admin/aliases',
        entrypoint: './src/dev-admin/pages/admin-aliases.astro',
      })
    },
  },
})
