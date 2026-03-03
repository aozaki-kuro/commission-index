type AssetFetcher = {
  fetch: (request: Request) => Promise<Response>
}

type Env = {
  ASSETS: AssetFetcher
}

const redirectMap = new Map<string, string>([
  ['/commission', '/'],
  ['/feed.xml', '/rss.xml'],
  ['/rss', '/rss.xml'],
])

const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/')

const isAdminApiPath = (pathname: string) => pathname.startsWith('/api/admin/')

const isAssetLikePath = (pathname: string) => {
  const lastSegment = pathname.split('/').pop() ?? ''
  return lastSegment.includes('.')
}

const fetchAsset = (env: Env, pathname: string) =>
  env.ASSETS.fetch(new Request(`https://assets.local${pathname}`))

const notFoundHtmlResponse = async (env: Env) => {
  const notFoundAsset = await fetchAsset(env, '/404.html')
  if (notFoundAsset.ok) {
    return new Response(notFoundAsset.body, {
      status: 404,
      headers: notFoundAsset.headers,
    })
  }

  return new Response('Not Found', { status: 404 })
}

const app = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    if (isAdminApiPath(pathname) || isAdminPath(pathname)) {
      return notFoundHtmlResponse(env)
    }

    const redirectTarget = redirectMap.get(pathname)
    if (redirectTarget) {
      const location = new URL(redirectTarget, url.origin)
      return Response.redirect(location.toString(), 301)
    }

    const assetResponse = await env.ASSETS.fetch(request)
    if (assetResponse.status !== 404 || isAssetLikePath(pathname)) {
      return assetResponse
    }

    const indexResponse = await fetchAsset(env, '/index.html')
    if (!indexResponse.ok) return assetResponse
    return new Response(indexResponse.body, {
      status: 200,
      headers: indexResponse.headers,
    })
  },
}

export default app
