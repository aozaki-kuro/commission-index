import type { AstroIntegration } from 'astro'
import { spawn } from 'node:child_process'

const runAssetsSyncCli = async (reason: string) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['run', 'server/assetsSyncCli.ts', '--reason', reason], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`assets sync command exited with code ${code ?? 'null'}`))
    })
  })
}

const runAssetPipelineWithLog = async ({
  reason,
  failOnError,
  logPrefix,
  logger,
}: {
  reason: string
  failOnError: boolean
  logPrefix: string
  logger: { info: (message: string) => void; error: (message: string) => void }
}) => {
  const startedAt = Date.now()
  logger.info(`[${logPrefix}] start reason=${reason}`)

  try {
    await runAssetsSyncCli(reason)
    logger.info(`[${logPrefix}] done in ${Date.now() - startedAt}ms`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[${logPrefix}] failed: ${message}`)
    if (failOnError) {
      throw error
    }
  }
}

export const assetsPipelineIntegration = (): AstroIntegration => ({
  name: 'assets-pipeline',
  hooks: {
    'astro:server:setup': async ({ logger }) => {
      await runAssetPipelineWithLog({
        reason: 'astro-dev-startup',
        failOnError: false,
        logPrefix: 'assets/dev-startup',
        logger,
      })
    },
    'astro:build:start': async ({ logger }) => {
      await runAssetPipelineWithLog({
        reason: 'astro-build-start',
        failOnError: true,
        logPrefix: 'assets/build-start',
        logger,
      })
    },
  },
})
