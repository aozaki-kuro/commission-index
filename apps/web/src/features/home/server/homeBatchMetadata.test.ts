import type { CharacterCommissions, Commission } from '@data/types'
import { buildTimelineYearNavItem } from '@lib/commissions/timeline'
import { describe, expect, it, vi } from 'vitest'
import { buildHomeCharacterBatchPayload } from './homeCharacterBatchPayload'
import { buildHomeTimelineBatchPayload } from './homeTimelineBatchPayload'

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
    creatorName: null,
    workGroupId: '00000000-0000-4000-8000-000000000002',
    partNumber: 2,
    fileName: 'opaque-key',
    Links: [],
    ...overrides,
  }
}

const characterAliasesMap = null
const creatorAliasesMap = null
const keywordAliasesMap = null

describe('commission batch metadata', () => {
  it('uses Anon and Part N in character batch payloads', async () => {
    const commissions: CharacterCommissions = {
      Character: 'Alpha',
      Commissions: [createCommission()],
    }
    const payload = await buildHomeCharacterBatchPayload({
      batchIndex: 0,
      characterAliasesMap,
      characters: ['Alpha'],
      commissionMap: new Map([['Alpha', commissions]]),
      creatorAliasesMap,
      keywordAliasesMap,
      locale: 'en',
      status: 'active',
    })

    expect(payload.sections[0]?.entries[0]).toMatchObject({
      primaryText: 'Anon',
      partLabel: 'Part 2',
      secondaryText: null,
    })
  })

  it('uses Anon and Part N in timeline batch payloads', async () => {
    const commission = createCommission({ Description: 'A short description' })
    const navItem = buildTimelineYearNavItem('2024')
    const payload = await buildHomeTimelineBatchPayload({
      batchIndex: 0,
      characterAliasesMap,
      creatorAliasesMap,
      groups: [{
        yearKey: '2024',
        sectionId: navItem.sectionId,
        titleId: navItem.titleId,
        navItem,
        entries: [{ character: 'Alpha', commission }],
      }],
      keywordAliasesMap,
      locale: 'en',
    })

    expect(payload.sections[0]?.entries[0]).toMatchObject({
      primaryText: 'Anon',
      partLabel: 'Part 2',
      secondaryText: '"A short description"',
    })
  })
})
