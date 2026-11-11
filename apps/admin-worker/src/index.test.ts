import type { Env } from './index'
import { describe, expect, it, vi } from 'vitest'
import worker from './index'

const assets = {
  fetch: vi.fn(async () => new Response('asset')),
}
// No DB binding: a request that gets past the guards answers 503 from the API layer.
const env = { ASSETS: assets } as unknown as Env
const devEnv = { ...env, ALLOW_LOCAL_ORIGINS: '1' }
const ctx = {
  waitUntil: () => {},
}
// `wrangler dev` reports the route host in request.url even for requests sent to 127.0.0.1.
const api = 'https://admin.example.com/api/admin'

function send(url: string, init: RequestInit = {}, workerEnv = env) {
  return worker.fetch(new Request(url, init), workerEnv, ctx)
}

describe('admin worker entry', () => {
  it('rejects a cross-origin write before it reaches the API', async () => {
    const response = await send('https://admin.example.com/api/admin/suggestion', {
      method: 'POST',
      headers: { 'Origin': 'https://evil.example', 'Content-Type': 'text/plain' },
      body: '{"featuredKeywords":[]}',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ status: 'error' })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('rejects a local page and a malformed Origin when the dev flag is unset', async () => {
    for (const origin of ['http://localhost:4174', 'null']) {
      const response = await send(`${api}/rebuild`, {
        method: 'POST',
        headers: { Origin: origin },
      })
      expect(response.status).toBe(403)
    }
  })

  it('keeps rejecting non-local origins under the dev flag', async () => {
    const response = await send(`${api}/rebuild`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    }, devEnv)
    expect(response.status).toBe(403)
  })

  it('lets same-origin, dev-flagged local and Origin-less writes through', async () => {
    const cases: Array<[string | null, Env]> = [
      ['https://admin.example.com', env],
      ['http://localhost:4174', devEnv],
      ['http://127.0.0.1:4174', devEnv],
      [null, env],
    ]
    for (const [origin, workerEnv] of cases) {
      const response = await send(`${api}/suggestion`, {
        method: 'POST',
        headers: origin
          ? { Origin: origin }
          : {},
        body: '{"featuredKeywords":[]}',
      }, workerEnv)
      expect(response.status).not.toBe(403)
    }
  })

  it('does not guard reads', async () => {
    const response = await send('https://admin.example.com/api/admin/health', {
      headers: { Origin: 'https://evil.example' },
    })
    expect(response.status).not.toBe(403)
  })

  it('answers a malformed JSON body with the error envelope instead of throwing', async () => {
    const response = await send(`${api}/characters`, {
      method: 'POST',
      headers: { 'Origin': 'http://localhost:4174', 'Content-Type': 'application/json' },
      body: '{not json',
    }, devEnv)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ status: 'error' })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4174')
  })

  it('sends nosniff on every API response, with or without an allowed Origin', async () => {
    const throwingEnv = {
      ...env,
      DB: {
        prepare() {
          throw new Error('boom')
        },
      },
    } as unknown as Env
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const responses = [
      await send(`${api}/health`),
      await send(`${api}/health`, {
        headers: { Origin: 'https://admin.example.com' },
      }),
      await send(`${api}/characters`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://admin.example.com' },
      }),
      await send(`${api}/rebuild`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
      await send(`${api}/characters`, { method: 'POST', body: '{not json' }, devEnv),
      await send(`${api}/unknown`),
      await send(`${api}/bootstrap`, {}, throwingEnv),
    ]

    expect(responses.map(response => response.status)).toEqual([200, 200, 204, 403, 400, 404, 500])
    for (const response of responses) {
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    }
  })
})
