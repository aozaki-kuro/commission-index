import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { handleAdminApiRequest } from './admin-api-handler'

const START_PORT = Number(process.env.ADMIN_API_PORT ?? 8788)
const PORT_FILE_PATH = process.env.ADMIN_API_PORT_FILE
const MAX_PORT_ATTEMPTS = 200

const isAddressInUseError = (error: unknown) => {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? String((error as { code?: string }).code) : ''
  return code === 'EADDRINUSE' || error.message.includes('EADDRINUSE')
}

const announceListeningPort = async (port: number) => {
  if (PORT_FILE_PATH) {
    await writeFile(PORT_FILE_PATH, String(port), 'utf8')
  }
  console.log(`[admin-api] listening on http://localhost:${port}`)
}

const createNodeRequestServer = (port: number) =>
  createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? `localhost:${port}`
      const url = `http://${host}${req.url ?? '/'}`
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

const startServer = async () => {
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
    const port = START_PORT + attempt

    const server = createNodeRequestServer(port)
    const listenResult = await new Promise<{ ok: true } | { ok: false; error: unknown }>(
      resolve => {
        server.once('error', error => resolve({ ok: false, error }))
        server.listen(port, () => resolve({ ok: true }))
      },
    )

    if (!listenResult.ok) {
      server.close()
      if (isAddressInUseError(listenResult.error)) continue
      throw listenResult.error
    }

    await announceListeningPort(port)
    return
  }

  throw new Error(
    `No available admin API port found in range ${START_PORT}-${START_PORT + MAX_PORT_ATTEMPTS - 1}.`,
  )
}

await startServer()
