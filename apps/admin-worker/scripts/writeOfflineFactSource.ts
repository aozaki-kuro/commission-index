/**
 * Writes the empty offline fact-source fixture used by the visual web server without D1/R2 access.
 * Mirrors the inline fixture in .github/workflows/ci.yml; keep the two in step.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { GENERATED_FACT_SOURCE_SCHEMA_VERSION } from '@commission-index/domain'
import { createSnapshot } from './exportWebFactSource'

type SnapshotInput = Parameters<typeof createSnapshot>

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const directory = path.resolve(scriptDir, '../../web/generated/fact-source')
const contentPath = path.join(directory, 'content.json')

// A real export holds production metadata; never replace it with the empty fixture.
if (existsSync(contentPath)) {
  const existing = JSON.parse(readFileSync(contentPath, 'utf8'))
  if (existing?.meta?.databaseBinding !== 'fixture') {
    console.error(`Refusing to overwrite the real snapshot at ${contentPath}.`)
    console.error('Delete apps/web/generated/ first if you really want the offline fixture.')
    process.exit(1)
  }
}

const meta: SnapshotInput[0]['meta'] = {
  schemaVersion: GENERATED_FACT_SOURCE_SCHEMA_VERSION,
  source: 'remote-admin-fact-source',
  exportedAt: '2000-01-01T00:00:00.000Z',
  databaseBinding: 'fixture',
  imagesBucket: 'fixture',
}
const content: SnapshotInput[0] = {
  meta,
  characters: [],
  creatorAliases: [],
  characterAliases: [],
  keywordAliases: [],
  featuredSearchKeywords: [],
}
const snapshot = createSnapshot(content, { meta, files: [], missing: [] } satisfies SnapshotInput[1])

mkdirSync(directory, { recursive: true })
writeFileSync(contentPath, JSON.stringify(snapshot.content))
writeFileSync(path.join(directory, 'source-images-manifest.json'), JSON.stringify(snapshot.manifest))
