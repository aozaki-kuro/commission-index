import { readFile } from 'node:fs/promises'
import { runAssets } from './assets'

const DEFAULT_ADMIN_API_PORT = 8788
const DEFAULT_WEB_PORT = 5173
const ADMIN_PORT_RESOLVE_TIMEOUT_MS = 12_000
const ADMIN_PORT_POLL_INTERVAL_MS = 100

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const readResolvedAdminApiPort = async (portFilePath: string): Promise<number | null> => {
  try {
    const content = await readFile(portFilePath, 'utf8')
    const parsed = Number(content.trim())
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

const waitForAdminApiPort = async ({
  apiProcess,
  portFilePath,
  fallbackPort,
}: {
  apiProcess: BunSubprocess
  portFilePath: string
  fallbackPort: number
}) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < ADMIN_PORT_RESOLVE_TIMEOUT_MS) {
    const port = await readResolvedAdminApiPort(portFilePath)
    if (port) return port

    const maybeExit = await Promise.race([
      apiProcess.exited.then((code: number) => ({ exited: true as const, code })),
      sleep(ADMIN_PORT_POLL_INTERVAL_MS).then(() => ({ exited: false as const, code: 0 })),
    ])
    if (maybeExit.exited) {
      throw new Error(`Admin API exited before reporting its port (exit code ${maybeExit.code}).`)
    }
  }

  return fallbackPort
}

const run = async () => {
  const requestedAdminApiPort = Number(process.env.ADMIN_API_PORT ?? DEFAULT_ADMIN_API_PORT)
  const adminApiPortFile = `/tmp/commission-admin-api-port-${process.pid}.txt`
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'development',
    ADMIN_API_PORT: String(requestedAdminApiPort),
    ADMIN_API_PORT_FILE: adminApiPortFile,
  }

  const api = Bun.spawn(['node', '--import', 'tsx', 'server/admin-api.ts'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: baseEnv,
  })
  const resolvedAdminApiPort = await waitForAdminApiPort({
    apiProcess: api,
    portFilePath: adminApiPortFile,
    fallbackPort: requestedAdminApiPort,
  })
  const webEnv = {
    ...baseEnv,
    VITE_ADMIN_API_PORT: String(resolvedAdminApiPort),
  }
  const preferredWebPort = Number(process.env.PORT ?? DEFAULT_WEB_PORT)
  console.log(
    `[dev] web port (preferred): ${preferredWebPort}, admin API port: ${resolvedAdminApiPort}, proxy target: http://localhost:${resolvedAdminApiPort}`,
  )
  await runAssets({
    mode: 'dev',
    tasks: [],
    reason: 'dev-script startup',
  })

  const web = Bun.spawn(['bun', 'x', 'astro', 'dev', '--port', String(preferredWebPort)], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: webEnv,
  })

  const cleanup = () => {
    if (!api.killed) api.kill()
    if (!web.killed) web.kill()
  }

  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })

  const [apiExit, webExit] = await Promise.race([
    api.exited.then((code: number) => [code, null] as const),
    web.exited.then((code: number) => [null, code] as const),
  ])

  if (apiExit === null) {
    cleanup()
    process.exit(webExit ?? 1)
  }

  cleanup()
  process.exit(apiExit)
}

await run()
