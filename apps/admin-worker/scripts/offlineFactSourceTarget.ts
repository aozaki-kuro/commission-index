import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

/** Realpath of the deepest existing ancestor plus the not-yet-created remainder, so symlinks cannot hide the target. */
function realpathLoose(target: string): string {
  const resolved = path.resolve(target)
  let existing = resolved
  while (!existsSync(existing) && path.dirname(existing) !== existing) {
    existing = path.dirname(existing)
  }
  return path.join(realpathSync(existing), path.relative(existing, resolved))
}

/**
 * Resolves where the fixture is written and refuses targets that could hold a real export.
 * `configuredDir` is `FACT_SOURCE_DIR` (absolute, or relative to `webRoot`); unset means `<webRoot>/generated`.
 * Throws instead of exiting so it can be unit tested.
 */
export function resolveOfflineFactSourceTarget(webRoot: string, configuredDir: string | undefined) {
  const generatedDir = path.join(webRoot, 'generated')
  const override = configuredDir?.trim()
  const rootDir = override ? path.resolve(webRoot, override) : generatedDir
  if (override && realpathLoose(rootDir) === realpathLoose(generatedDir)) {
    throw new Error(`Refusing to write the fixture into ${generatedDir}: that directory holds the real export. Unset FACT_SOURCE_DIR or point it elsewhere.`)
  }

  const directory = path.join(rootDir, 'fact-source')
  const contentPath = path.join(directory, 'content.json')
  if (existsSync(contentPath)) {
    let binding: unknown
    try {
      binding = JSON.parse(readFileSync(contentPath, 'utf8'))?.meta?.databaseBinding
    }
    catch {
      binding = undefined
    }
    if (binding !== 'fixture') {
      throw new Error(`Refusing to overwrite the real snapshot at ${contentPath}. Delete that directory first if you really want the offline fixture.`)
    }
  }
  return { directory, contentPath }
}
