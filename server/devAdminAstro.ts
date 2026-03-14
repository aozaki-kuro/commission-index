import type { AstroIntegration } from 'astro'
import type { AstroVitePlugin } from './astroVitePluginType'
import { toWebRequest, writeNodeResponse } from './httpBridge'

const ADMIN_API_PREFIX = '/api/admin/'

export function devAdminApiPlugin(): AstroVitePlugin {
  return {
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
          const { handleAdminApiRequest } = await server.ssrLoadModule('/server/adminApiHandler.ts')
          const request = toWebRequest(req, {
            requestPath,
            fallbackHost: 'localhost',
          })
          const response = await handleAdminApiRequest(request)
          await writeNodeResponse(res, response)
        }
        catch (error) {
          const message = error instanceof Error ? error.message : 'Unexpected server error.'
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'error', message }))
        }
      })
    },
  }
}

export function devAdminRoutesIntegration(): AstroIntegration {
  return {
    name: 'dev-admin-routes',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev')
          return

        injectRoute({
          pattern: '/admin',
          entrypoint: './src/devAdmin/pages/adminIndex.astro',
        })
        injectRoute({
          pattern: '/admin/create',
          entrypoint: './src/devAdmin/pages/adminCreate.astro',
        })
        injectRoute({
          pattern: '/admin/edit',
          entrypoint: './src/devAdmin/pages/adminEdit.astro',
        })
        injectRoute({
          pattern: '/admin/aliases',
          entrypoint: './src/devAdmin/pages/adminAliases.astro',
        })
        injectRoute({
          pattern: '/admin/suggestion',
          entrypoint: './src/devAdmin/pages/adminSuggestion.astro',
        })
      },
    },
  }
}
