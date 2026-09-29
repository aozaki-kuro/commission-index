import { describe, expect, it } from 'vitest'
import { validateGeneratedFactSourceSnapshot } from './generatedFactSource'

const meta = {
  schemaVersion: 3,
  source: 'remote-admin-fact-source',
  exportedAt: '2026-09-29T00:00:00.000Z',
  revision: 'fixture-revision',
  databaseBinding: 'DB',
  imagesBucket: 'images',
}

const publicId = (value: string) => `00000000-0000-4000-8000-${value.padStart(12, '0')}`

function snapshot(commissions: unknown[] = [{
  id: 1,
  publicId: publicId('1'),
  commissionDate: '2024-02-29',
  creatorName: 'Artist',
  fileName: 'opaque-source-key',
  workGroupId: null,
  partNumber: null,
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
  it('accepts schema v3 when content and manifest revisions match', () => {
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
    const missing = snapshot([{ publicId: publicId('1'), commissionDate: null, creatorName: null, fileName: 'missing-id', workGroupId: null, partNumber: null }])
    const duplicate = snapshot([
      { id: 7, publicId: publicId('7'), commissionDate: null, creatorName: null, fileName: 'first', workGroupId: null, partNumber: null },
      { id: 7, publicId: publicId('8'), commissionDate: null, creatorName: null, fileName: 'second', workGroupId: null, partNumber: null },
    ])

    expect(() => validateGeneratedFactSourceSnapshot(missing.content, missing.manifest)).toThrow(/commission ID/)
    expect(() => validateGeneratedFactSourceSnapshot(duplicate.content, duplicate.manifest)).toThrow(/commission ID/)
  })

  it('rejects impossible calendar dates and mismatched revisions', () => {
    const invalidDate = snapshot([{ id: 8, publicId: publicId('8'), commissionDate: '2024-02-30', creatorName: null, fileName: 'bad-date', workGroupId: null, partNumber: null }])
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

  it('requires unique canonical lowercase UUID public IDs and valid optional part metadata', () => {
    const missing = snapshot([{ id: 1, commissionDate: null, creatorName: null, fileName: 'missing-public-id', workGroupId: null, partNumber: null }])
    const duplicate = snapshot([
      { id: 1, publicId: publicId('1'), commissionDate: null, creatorName: null, fileName: 'first', workGroupId: null, partNumber: null },
      { id: 2, publicId: publicId('1'), commissionDate: null, creatorName: null, fileName: 'second', workGroupId: null, partNumber: null },
    ])
    const uppercase = snapshot([{ id: 1, publicId: publicId('A').toUpperCase(), commissionDate: null, creatorName: null, fileName: 'uppercase', workGroupId: null, partNumber: null }])
    const invalidPart = snapshot([{ id: 1, publicId: publicId('1'), commissionDate: null, creatorName: null, fileName: 'bad-part', workGroupId: null, partNumber: 0 }])
    const incompletePart = snapshot([{ id: 1, publicId: publicId('1'), commissionDate: null, creatorName: null, fileName: 'incomplete-part', workGroupId: publicId('2'), partNumber: null }])
    const invalidGroup = snapshot([{ id: 1, publicId: publicId('1'), commissionDate: null, creatorName: null, fileName: 'invalid-group', workGroupId: 'not-a-uuid', partNumber: 1 }])

    expect(() => validateGeneratedFactSourceSnapshot(missing.content, missing.manifest)).toThrow(/public commission ID/)
    expect(() => validateGeneratedFactSourceSnapshot(duplicate.content, duplicate.manifest)).toThrow(/public commission ID/)
    expect(() => validateGeneratedFactSourceSnapshot(uppercase.content, uppercase.manifest)).toThrow(/public commission ID/)
    expect(() => validateGeneratedFactSourceSnapshot(invalidPart.content, invalidPart.manifest)).toThrow(/part number/)
    expect(() => validateGeneratedFactSourceSnapshot(incompletePart.content, incompletePart.manifest)).toThrow(/set together/)
    expect(() => validateGeneratedFactSourceSnapshot(invalidGroup.content, invalidGroup.manifest)).toThrow(/work group ID/)
  })
})
