import type { AstroIntegration } from 'astro'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'

const ADMIN_API_PREFIX = '/api/admin/'
const DEV_ASSET_DB_PATH = path.join(process.cwd(), 'data', 'commissions.db')
const normalizePath = (value: string) => value.replace(/\\/g, '/')

const runDevAssetsCommand = async (reason: string) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'bun',
      [
        'run',
        'scripts/assets.ts',
        '--mode',
        'dev',
        '--tasks',
        'home-update-summary,home-search-entries',
        '--reason',
        reason,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'development',
        },
        stdio: ['ignore', 'inherit', 'inherit'],
      },
    )

    child.once('error', error => {
      reject(error)
    })
    child.once('exit', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`assets command exited with code ${code ?? 'null'}`))
    })
  })
}

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

export const devAssetsPipelinePlugin = (): Plugin => ({
  name: 'dev-assets-pipeline',
  configureServer(server) {
    if (server.config.mode !== 'development') return

    let isRunning = false
    let queuedReason: string | null = null

    const runDevAssets = async (reason: string) => {
      if (isRunning) {
        queuedReason = reason
        return
      }

      isRunning = true
      try {
        await runDevAssetsCommand(reason)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        server.config.logger.error(`[dev-assets] ${message}`)
      } finally {
        isRunning = false
        if (queuedReason) {
          const nextReason = queuedReason
          queuedReason = null
          await runDevAssets(nextReason)
        }
      }
    }

    const handleInputFileEvent = (filePath: string) => {
      if (normalizePath(filePath) !== normalizePath(DEV_ASSET_DB_PATH)) return

      const relativePath = path.relative(process.cwd(), filePath)
      void runDevAssets(`watch:${relativePath}`)
    }

    server.watcher.add(DEV_ASSET_DB_PATH)
    server.watcher.on('change', handleInputFileEvent)
    server.watcher.on('add', handleInputFileEvent)
    void runDevAssets('astro-dev-startup')

    return () => {
      server.watcher.off('change', handleInputFileEvent)
      server.watcher.off('add', handleInputFileEvent)
    }
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
