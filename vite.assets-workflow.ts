import { spawn } from 'node:child_process'

import type { Plugin } from 'vite'

type AssetsMode = 'dev' | 'build'

const runAssetsScript = (mode: AssetsMode) =>
  new Promise<void>((resolve, reject) => {
    const script = mode === 'build' ? 'assets:build' : 'assets:dev'
    const child = spawn('bun', ['run', script], {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`\`bun run ${script}\` failed with exit code ${code ?? 'unknown'}`))
    })
  })

export const assetsWorkflowPlugin = (): Plugin => {
  let hasRunForServe = false

  return {
    name: 'commission-assets-workflow',
    async buildStart() {
      if (this.environment.name !== 'client') return
      if (this.meta.watchMode !== true) return
      if (hasRunForServe) return
      hasRunForServe = true
      await runAssetsScript('dev')
    },
    async configResolved(config) {
      if (config.command !== 'build') return
      await runAssetsScript('build')
    },
  }
}
