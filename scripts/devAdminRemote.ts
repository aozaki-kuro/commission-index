import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'

const workerPort = process.env.WORKER_PORT?.trim() || '8787'
const adminApiBaseUrl = process.env.ADMIN_API_BASE_URL?.trim() || `http://127.0.0.1:${workerPort}`
const workerReadyUrl = `${adminApiBaseUrl.replace(/\/+$/, '')}/api/admin/bootstrap`
const workerReadyTimeoutMs = Number.parseInt(
  process.env.ADMIN_WORKER_READY_TIMEOUT_MS?.trim() || '',
  10,
) || 30_000
const workerReadyPollMs = 400
// Must match `--port` in apps/admin/package.json `dev` (--strictPort); Vite would otherwise fail late.
const adminPort = 4174

const children = new Set<ReturnType<typeof spawn>>()
let stopping = false

function startProcess(name: string, args: string[], extraEnv: Record<string, string> = {}) {
  const child = spawn('pnpm', args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  })

  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)

    if (stopping) {
      return
    }

    // Log here: the outer catch stays silent once `stopping` is set, so an unexpected exit
    // would otherwise be indistinguishable from a normal Ctrl+C shutdown.
    console.error(
      `[dev:admin] ${name} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code}`}); stopping.`,
    )
    stopping = true
    stopAll(signal ? 0 : (code ?? 1))
  })

  child.on('error', (error) => {
    if (stopping) {
      return
    }

    console.error(`[dev:admin] failed to start ${name}:`, error)
    stopping = true
    stopAll(1)
  })

  return child
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function assertPortAvailable(port: number, name: string) {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()

    server.once('error', (error) => {
      reject(error)
    })

    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }).catch((error) => {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[dev:admin] port ${port} for ${name} is already in use. Stop the existing process first. (${detail})`,
    )
  })
}

async function waitForWorkerReady(url: string, timeoutMs: number) {
  const startedAt = Date.now()

  for (;;) {
    if (stopping) {
      return
    }

    const controller = new AbortController()
    const requestTimeout = setTimeout(() => controller.abort(), 2_000)

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      })

      if (response.ok) {
        clearTimeout(requestTimeout)
        return
      }
    }
    catch {
      // Ignore transient startup failures while Wrangler is still booting.
    }
    finally {
      clearTimeout(requestTimeout)
    }

    if (Date.now() - startedAt >= timeoutMs) {
      // Reached only while the worker is still alive; a crash is reported by its exit handler.
      throw new Error(
        `Timed out waiting for admin worker readiness at ${url} after ${timeoutMs}ms; the worker process is still running (not exited).`,
      )
    }

    await sleep(workerReadyPollMs)
  }
}

function stopAll(exitCode = 0) {
  for (const child of children) {
    child.kill('SIGTERM')
  }

  setTimeout(() => {
    for (const child of children) {
      child.kill('SIGKILL')
    }
    process.exit(exitCode)
  }, 1200).unref()
}

process.on('SIGINT', () => {
  if (stopping) {
    return
  }
  stopping = true
  stopAll(0)
})

process.on('SIGTERM', () => {
  if (stopping) {
    return
  }
  stopping = true
  stopAll(0)
})

async function main() {
  await assertPortAvailable(Number.parseInt(workerPort, 10), 'admin worker')
  // Check before spawning: a busy 4174 would otherwise only surface after the worker has booted.
  await assertPortAvailable(adminPort, 'admin frontend')
  startProcess('admin-worker', ['-C', 'apps/admin-worker', 'dev'])

  console.log(`[dev:admin] waiting for worker data readiness at ${workerReadyUrl}`)
  await waitForWorkerReady(workerReadyUrl, workerReadyTimeoutMs)
  // The wait returns early without throwing when the worker exits; do not start the frontend then.
  if (stopping) {
    return
  }
  console.log('[dev:admin] worker is ready, starting admin frontend')

  startProcess('admin', ['-C', 'apps/admin', 'dev'], {
    ADMIN_API_BASE_URL: adminApiBaseUrl,
  })
}

void main().catch((error) => {
  if (stopping) {
    return
  }

  console.error(
    '[dev:admin] failed to initialize standalone admin dev workflow:',
    error instanceof Error ? error.message : error,
  )
  stopping = true
  stopAll(1)
})
