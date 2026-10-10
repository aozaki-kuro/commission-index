import type { CharacterCommissions, Commission } from '@data/types'
import { describe, expect, it, vi } from 'vitest'
import {
  buildHomeCharacterBatchArtifacts,
  buildHomeCharacterBatchManifest,
  clearHomeCharacterBatchArtifactsCacheForTests,
} from './homeCharacterBatchArtifacts'
import { buildHomeCharacterBatchPlan, buildHomeCharacterBatchUrl } from './homeCharacterBatches'

vi.mock('./batchPayloadBuilder', () => ({
  COMMISSION_IMAGE_SIZES: '(max-width: 768px) 92vw, 640px',
  COMMISSION_LINK_TEXT_CLASS: 'link',
  buildImagePayload: async () => null,
  buildInterestPayload: () => null,
}))

function createCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: 1,
    publicId: '00000000-0000-4000-8000-000000000001',
    commissionDate: '2024-02-03',
    creatorName: 'artist',
    workGroupId: null,
    partNumber: null,
    fileName: 'opaque-key',
    Links: [],
    ...overrides,
  }
}

function createInput({ locale = 'en', description }: { locale?: 'en' | 'ja', description?: string } = {}) {
  const commissions: CharacterCommissions = {
    Character: 'Beta',
    Commissions: [createCommission(description ? { Description: description } : {})],
  }
  const commissionMap = new Map([['Beta', commissions]])

  return {
    base: {
      characterAliasesMap: null,
      commissionMap,
      creatorAliasesMap: null,
      keywordAliasesMap: null,
      locale: locale as 'en' | 'ja',
    },
    plan: buildHomeCharacterBatchPlan({
      activeChars: [{ DisplayName: 'Alpha' }, { DisplayName: 'Beta' }],
      archivedChars: [],
      commissionMap,
    }),
  }
}

describe('buildHomeCharacterBatchArtifacts', () => {
  it('derives the same version for identical payloads', async () => {
    clearHomeCharacterBatchArtifactsCacheForTests()
    const a = createInput()
    const b = createInput()

    const [first] = await buildHomeCharacterBatchArtifacts({ ...a.base, plan: a.plan, status: 'active' })
    const [second] = await buildHomeCharacterBatchArtifacts({ ...b.base, plan: b.plan, status: 'active' })

    expect(first!.version).toBe(second!.version)
  })

  it('changes the version when a localized message changes (locale)', async () => {
    clearHomeCharacterBatchArtifactsCacheForTests()
    const en = createInput({ locale: 'en' })
    const ja = createInput({ locale: 'ja' })

    const [enArtifact] = await buildHomeCharacterBatchArtifacts({ ...en.base, plan: en.plan, status: 'active' })
    const [jaArtifact] = await buildHomeCharacterBatchArtifacts({ ...ja.base, plan: ja.plan, status: 'active' })

    expect(enArtifact!.version).not.toBe(jaArtifact!.version)
  })

  it('changes the version when any payload field changes', async () => {
    clearHomeCharacterBatchArtifactsCacheForTests()
    const plain = createInput()
    const described = createInput({ description: 'A short description' })

    const [plainArtifact] = await buildHomeCharacterBatchArtifacts({ ...plain.base, plan: plain.plan, status: 'active' })
    const [describedArtifact] = await buildHomeCharacterBatchArtifacts({ ...described.base, plan: described.plan, status: 'active' })

    expect(plainArtifact!.version).not.toBe(describedArtifact!.version)
  })

  it('names the endpoint path from the same version the manifest advertises', async () => {
    clearHomeCharacterBatchArtifactsCacheForTests()
    const { base, plan } = createInput()

    const artifacts = await buildHomeCharacterBatchArtifacts({ ...base, plan, status: 'active' })
    const manifest = await buildHomeCharacterBatchManifest({ ...base, plan, searchEntriesVersion: 'search-v' })

    expect(manifest.active.batchVersions).toEqual(artifacts.map(artifact => artifact.version))
    // The manifest URL and the batch endpoint's `[batch]` param share the builder.
    expect(buildHomeCharacterBatchUrl({
      batchIndex: 0,
      locale: 'en',
      status: 'active',
      v: manifest.active.batchVersions![0],
    })).toBe(`/search/home-character-batches/en/active/0.${artifacts[0]!.version}.json`)
  })
})
