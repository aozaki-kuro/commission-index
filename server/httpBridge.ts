import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

export function toWebRequest(req: IncomingMessage, {
  requestPath,
  fallbackHost,
}: {
  requestPath: string
  fallbackHost: string
}) {
  const host = req.headers.host ?? fallbackHost
  const url = `http://${host}${requestPath}`
  const method = req.method ?? 'GET'
  const body
    = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream)
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

export async function writeNodeResponse(res: ServerResponse, response: Response) {
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
