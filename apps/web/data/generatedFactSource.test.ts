import { describe, expect, it } from 'vitest'
import { validateGeneratedFactSourceSnapshot } from './generatedFactSource'

const meta = {
  schemaVersion: 2,
  source: 'remote-admin-fact-source',
  exportedAt: '2026-09-29T00:00:00.000Z',
  revision: 'fixture-revision',
  databaseBinding: 'DB',
  imagesBucket: 'images',
}

function snapshot(commissions: unknown[] = [{
  id: 1,
  commissionDate: '2024-02-29',
  creatorName: 'Artist',
  fileName: 'opaque-source-key',
}]) {
  const files = commissions
    .filter((commission): commission is Record<string, unknown> => typeof commission === 'object' && commission !== null)
    .filter(commission => Number.isSafeInteger(commission.id) && typeof commission.fileName === 'string')
    .map(commission => ({ commissionId: commission.id, commissionFileName: commission.fileName }))

  return {
    content: {
      meta: { ...meta },
      characters: [{ commissions }],
      creatorAliases: [],
      characterAliases: [],
      keywordAliases: [],
      featuredSearchKeywords: [],
    },
    manifest: { meta: { ...meta }, files, missing: [] as unknown[] },
  }
}

describe('generated fact-source snapshot validation', () => {
  it('accepts schema v2 when content and manifest revisions match', () => {
    const { content, manifest } = snapshot()

    expect(() => validateGeneratedFactSourceSnapshot(content, manifest)).not.toThrow()
  })

  it('rejects v1 content and manifest', () => {
    const { content, manifest } = snapshot()
    content.meta.schemaVersion = 1
    manifest.meta.schemaVersion = 1

    expect(() => validateGeneratedFactSourceSnapshot(content, manifest)).toThrow(/schema version/)
  })

  it('rejects missing and duplicate commission IDs', () => {
    const missing = snapshot([{ commissionDate: null, creatorName: null, fileName: 'missing-id' }])
    const duplicate = snapshot([
      { id: 7, commissionDate: null, creatorName: null, fileName: 'first' },
      { id: 7, commissionDate: null, creatorName: null, fileName: 'second' },
    ])

    expect(() => validateGeneratedFactSourceSnapshot(missing.content, missing.manifest)).toThrow(/commission ID/)
    expect(() => validateGeneratedFactSourceSnapshot(duplicate.content, duplicate.manifest)).toThrow(/commission ID/)
  })

  it('rejects impossible calendar dates and mismatched revisions', () => {
    const invalidDate = snapshot([{ id: 8, commissionDate: '2024-02-30', creatorName: null, fileName: 'bad-date' }])
    const mismatchedRevision = snapshot()
    mismatchedRevision.manifest.meta.revision = 'other-revision'

    expect(() => validateGeneratedFactSourceSnapshot(invalidDate.content, invalidDate.manifest)).toThrow(/commission date/)
    expect(() => validateGeneratedFactSourceSnapshot(mismatchedRevision.content, mismatchedRevision.manifest)).toThrow(/revisions do not match/)
  })

  it('rejects duplicate manifest IDs and manifests that omit a commission', () => {
    const duplicate = snapshot()
    duplicate.manifest.missing.push({ commissionId: 1, commissionFileName: 'opaque-source-key' })
    const incomplete = snapshot()
    incomplete.manifest.files = []

    expect(() => validateGeneratedFactSourceSnapshot(duplicate.content, duplicate.manifest)).toThrow(/Duplicate source-image manifest commission ID/)
    expect(() => validateGeneratedFactSourceSnapshot(incomplete.content, incomplete.manifest)).toThrow(/does not cover every commission ID/)
  })
})
