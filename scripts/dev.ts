import { runAssets } from './assets'

const DEFAULT_WEB_PORT = 5173

const run = async () => {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
  }
  const preferredWebPort = Number(process.env.PORT ?? DEFAULT_WEB_PORT)
  console.log(`[dev] web port (preferred): ${preferredWebPort}, admin API handled by Astro dev`)
  await runAssets({
    mode: 'dev',
    tasks: [],
    reason: 'dev-script startup',
  })

  const web = Bun.spawn(['bun', 'x', 'astro', 'dev', '--port', String(preferredWebPort)], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env,
  })

  const cleanup = () => {
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

  const webExit = await web.exited
  cleanup()
  process.exit(webExit)
}

await run()
