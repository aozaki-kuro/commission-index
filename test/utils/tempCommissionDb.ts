import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, vi } from 'vitest'

const projectRoot = process.cwd()
const tempDirs: string[] = []

export const setupTempCommissionDb = (prefix: string) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(tempDir)

  const tempDataDir = path.join(tempDir, 'data')
  fs.mkdirSync(tempDataDir, { recursive: true })
  fs.copyFileSync(
    path.join(projectRoot, 'data', 'commissions.db'),
    path.join(tempDataDir, 'commissions.db'),
  )

  return {
    projectRoot,
    tempDir,
    dbPath: path.join(tempDataDir, 'commissions.db'),
  }
}

export const resetModulesInTempDir = (tempDir: string) => {
  process.chdir(tempDir)
  vi.resetModules()
}

afterEach(() => {
  process.chdir(projectRoot)
  vi.resetModules()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
