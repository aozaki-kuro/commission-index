import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveOfflineFactSourceTarget } from '../scripts/offlineFactSourceTarget'

let webRoot: string

function writeContent(dir: string, databaseBinding: string) {
  mkdirSync(path.join(dir, 'fact-source'), { recursive: true })
  writeFileSync(path.join(dir, 'fact-source', 'content.json'), JSON.stringify({ meta: { databaseBinding } }))
}

beforeEach(() => {
  webRoot = mkdtempSync(path.join(tmpdir(), 'offline-target-'))
})
afterEach(() => {
  rmSync(webRoot, { recursive: true, force: true })
})

describe('resolveOfflineFactSourceTarget', () => {
  it('writes to generated/ by default and to the override dir when set', () => {
    expect(resolveOfflineFactSourceTarget(webRoot, undefined).directory).toBe(path.join(webRoot, 'generated', 'fact-source'))
    expect(resolveOfflineFactSourceTarget(webRoot, 'generated-fixture').directory).toBe(path.join(webRoot, 'generated-fixture', 'fact-source'))
  })

  it('refuses an override that resolves to generated/, including via absolute path or symlink', () => {
    mkdirSync(path.join(webRoot, 'generated'))
    symlinkSync(path.join(webRoot, 'generated'), path.join(webRoot, 'alias'))
    for (const value of ['generated', path.join(webRoot, 'generated'), 'alias', 'generated/../generated']) {
      expect(() => resolveOfflineFactSourceTarget(webRoot, value)).toThrow(/real export/)
    }
  })

  it('refuses to overwrite a non-fixture snapshot with or without an override, but allows a fixture one', () => {
    writeContent(path.join(webRoot, 'generated'), 'DB')
    expect(() => resolveOfflineFactSourceTarget(webRoot, undefined)).toThrow(/real snapshot/)
    writeContent(path.join(webRoot, 'other'), 'DB')
    expect(() => resolveOfflineFactSourceTarget(webRoot, 'other')).toThrow(/real snapshot/)
    writeContent(path.join(webRoot, 'fx'), 'fixture')
    expect(() => resolveOfflineFactSourceTarget(webRoot, 'fx')).not.toThrow()
  })
})
