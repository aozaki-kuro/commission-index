/**
 * Writes the offline fact-source fixture used by the visual web server without D1/R2 access.
 * Content comes from webVisualFixture.ts. With `FACT_SOURCE_DIR` set (absolute, or relative to `apps/web`) the
 * snapshot goes to `<dir>/fact-source`; unset, it goes to `apps/web/generated/fact-source` behind the real-export guard.
 * Both paths get the same fixture. .github/workflows/ci.yml still inlines an empty variant; Task 2 of the fixture plan replaces it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { GENERATED_FACT_SOURCE_SCHEMA_VERSION } from '@commission-index/domain'
import { createSnapshot } from './exportWebFactSource'
import {
  webVisualCharacterAliases,
  webVisualCharacters,
  webVisualCreatorAliases,
  webVisualFeaturedSearchKeywords,
  webVisualKeywordAliases,
} from './webVisualFixture'

type SnapshotInput = Parameters<typeof createSnapshot>

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(scriptDir, '../../web')
// Same semantics as apps/web/data/generatedFactSource.ts: absolute, or relative to apps/web.
const configuredDir = process.env.FACT_SOURCE_DIR?.trim()
const usesOverride = Boolean(configuredDir)
const directory = path.join(configuredDir ? path.resolve(webRoot, configuredDir) : path.join(webRoot, 'generated'), 'fact-source')
const contentPath = path.join(directory, 'content.json')

// A real export holds production metadata; never replace it with the empty fixture.
if (!usesOverride && existsSync(contentPath)) {
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
  characters: webVisualCharacters,
  creatorAliases: webVisualCreatorAliases,
  characterAliases: webVisualCharacterAliases,
  keywordAliases: webVisualKeywordAliases,
  featuredSearchKeywords: webVisualFeaturedSearchKeywords,
}
// The validator requires every commission in the manifest; with no image files they are all reported missing.
const missing = webVisualCharacters.flatMap(character => character.commissions).map(commission => ({
  commissionId: commission.id,
  commissionFileName: commission.fileName,
  candidateObjectKeys: [],
  reason: 'not_found' as const,
}))
const snapshot = createSnapshot(content, { meta, files: [], missing } satisfies SnapshotInput[1])

mkdirSync(directory, { recursive: true })
writeFileSync(contentPath, JSON.stringify(snapshot.content))
writeFileSync(path.join(directory, 'source-images-manifest.json'), JSON.stringify(snapshot.manifest))
