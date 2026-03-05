import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { toWebRequest, writeNodeResponse } from './httpBridge'

describe('httpBridge', () => {
  it('builds a web request from node request data', async () => {
    const req = Object.assign(Readable.from([Buffer.from('hello-world')]), {
      method: 'POST',
      headers: {
        host: 'example.com',
        'x-test': '1',
      },
    }) as unknown as IncomingMessage

    const request = toWebRequest(req, {
      requestPath: '/api/admin/bootstrap?foo=bar',
      fallbackHost: 'localhost',
    })

    expect(request.url).toBe('http://example.com/api/admin/bootstrap?foo=bar')
    expect(request.method).toBe('POST')
    expect(request.headers.get('x-test')).toBe('1')
    await expect(request.text()).resolves.toBe('hello-world')
  })

  it('writes web response to node response', async () => {
    const responseHeaders = new Map<string, string>()
    let responseBody: Uint8Array = Buffer.alloc(0)
    const res = {
      statusCode: 0,
      setHeader: (key: string, value: string) => {
        responseHeaders.set(key.toLowerCase(), value)
      },
      hasHeader: (key: string) => responseHeaders.has(key.toLowerCase()),
      end: (chunk?: Buffer | string) => {
        if (!chunk) {
          responseBody = Buffer.alloc(0)
          return
        }
        responseBody = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      },
    } as unknown as ServerResponse

    await writeNodeResponse(
      res,
      new Response('ok', {
        status: 201,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }),
    )

    expect(res.statusCode).toBe(201)
    expect(responseHeaders.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(responseHeaders.has('content-length')).toBe(true)
    expect(Buffer.from(responseBody).toString('utf8')).toBe('ok')
  })
})
