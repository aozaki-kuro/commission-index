import type { Env as AdminApiEnv } from './adminApi'
import { handleAdminApiRequest } from './adminApi'

interface AssetFetcher {
  fetch: (request: Request) => Promise<Response>
}

interface D1DatabaseLike {}

interface R2BucketLike {}

export interface Env extends AdminApiEnv {
  ASSETS: AssetFetcher
  DB?: D1DatabaseLike
  IMAGES?: R2BucketLike
  // Set only by the `dev` script (`--var`); never in wrangler.jsonc, so production has no local allowance.
  ALLOW_LOCAL_ORIGINS?: string
}

function noContent() {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function isLocalHostname(value: string | null) {
  if (!value) {
    return false
  }

  const hostname = value.toLowerCase().split(':')[0] ?? ''

  return hostname === '127.0.0.1'
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
}

function getAllowedCorsOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) {
    return null
  }

  try {
    const originUrl = new URL(origin)
    const requestUrl = new URL(request.url)

    if (originUrl.origin === requestUrl.origin) {
      return originUrl.origin
    }

    if (isLocalHostname(originUrl.hostname)) {
      return originUrl.origin
    }
  }
  catch {
    return null
  }

  return null
}

function withApiHeaders(request: Request, response: Response) {
  const headers = new Headers(response.headers)
  // The API also streams stored image bytes; never let a browser sniff them (or an error body) into another type.
  headers.set('X-Content-Type-Options', 'nosniff')

  const allowedOrigin = getAllowedCorsOrigin(request)
  if (!allowedOrigin) {
    return new Response(response.body, {
      status: response.status,
      headers,
    })
  }

  const requestedHeaders = request.headers.get('access-control-request-headers')

  headers.set('Access-Control-Allow-Origin', allowedOrigin)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', requestedHeaders ?? 'Authorization, Content-Type')
  headers.append('Vary', 'Origin')

  return new Response(response.body, {
    status: response.status,
    headers,
  })
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Zero Trust authenticates by cookie, and form-encoded or text/plain POSTs need no CORS preflight, so a page on
// another origin could otherwise write through the visitor's session. Browsers always send Origin on such requests;
// clients that send none (curl, service-token agents) carry no ambient cookie and are let through. The Vite dev
// server is a different origin, and `wrangler dev` reports the route's host in request.url, so the local allowance
// is an explicit dev-only flag rather than a guess from the request host.
function isForgedWrite(request: Request, env: Env) {
  const origin = request.headers.get('origin')
  if (SAFE_METHODS.has(request.method) || origin === null) {
    return false
  }

  try {
    const originUrl = new URL(origin)
    const requestUrl = new URL(request.url)
    return originUrl.origin !== requestUrl.origin
      && !(env.ALLOW_LOCAL_ORIGINS === '1' && isLocalHostname(originUrl.hostname))
  }
  catch {
    return true
  }
}

function jsonError(message: string, status: number) {
  return Response.json({ status: 'error', message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function handleApiRequest(request: Request, env: Env) {
  if (isForgedWrite(request, env)) {
    return jsonError('Cross-origin writes are not allowed.', 403)
  }

  try {
    return await handleAdminApiRequest(request, env)
  }
  catch (error) {
    // request.json() on a malformed body; anything else is a worker fault. Either way the client gets the JSON
    // envelope with CORS headers instead of Cloudflare's 1101 page.
    if (error instanceof SyntaxError) {
      return jsonError('Request body is not valid JSON.', 400)
    }
    console.error(error)
    return jsonError('Admin worker request failed.', 500)
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (request.method === 'OPTIONS' && pathname.startsWith('/api/admin/')) {
      return withApiHeaders(request, noContent())
    }

    if (pathname.startsWith('/api/admin/')) {
      return withApiHeaders(request, await handleApiRequest(request, env))
    }

    return env.ASSETS.fetch(request)
  },
}
