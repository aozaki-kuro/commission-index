import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerRebuildDeploy } from './adminApi'

describe('triggerRebuildDeploy', () => {
  afterEach(() => vi.unstubAllGlobals())
  const respond = (response: Response) => vi.stubGlobal('fetch', vi.fn(async () => response))

  it('returns the dispatch payload on success', async () => {
    const payload = { status: 'success', message: 'Queued', dispatchedAt: '2026-10-09T10:00:00.000Z' }
    respond(new Response(JSON.stringify(payload)))
    await expect(triggerRebuildDeploy()).resolves.toEqual(payload)
  })

  it('surfaces the JSON message on failure', async () => {
    respond(new Response(JSON.stringify({ message: 'Workflow dispatch refused' }), { status: 502 }))
    await expect(triggerRebuildDeploy()).rejects.toThrow('Workflow dispatch refused')
  })

  it('reports the HTTP status when the failure body is not JSON', async () => {
    respond(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(triggerRebuildDeploy()).rejects.toThrow('Rebuild request failed (HTTP 502).')
  })
})
