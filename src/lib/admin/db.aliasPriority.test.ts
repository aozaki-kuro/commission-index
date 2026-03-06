import { describe, expect, it } from 'vitest'
import { resetModulesInTempDir, setupTempCommissionDb } from '../../../test/utils/tempCommissionDb'

describe('admin aliases priority filtering', () => {
  it('hides lower-priority duplicate base terms from creator/keyword aliases', async () => {
    const { tempDir } = setupTempCommissionDb('commission-index-admin-alias-priority-')
    resetModulesInTempDir(tempDir)

    const adminDb = await import('./db')
    adminDb.saveCharacterAliasesBatch([{ characterName: 'Kanaut Nishe', aliases: ['カナウト'] }])
    adminDb.saveCreatorAliasesBatch([
      { creatorName: 'Kanaut Nishe', aliases: ['creator-duplicate'] },
      { creatorName: 'Nanashi', aliases: ['七市'] },
    ])
    adminDb.saveKeywordAliasesBatch([
      { baseKeyword: 'Kanaut Nishe', aliases: ['keyword-duplicate'] },
      { baseKeyword: 'maid', aliases: ['メイド'] },
    ])

    const aliasesData = adminDb.getAdminAliasesData()

    expect(aliasesData.characterAliases.some(row => row.characterName === 'Kanaut Nishe')).toBe(
      true,
    )
    expect(aliasesData.creatorAliases.some(row => row.creatorName === 'Kanaut Nishe')).toBe(false)
    expect(aliasesData.creatorAliases.some(row => row.creatorName === 'Nanashi')).toBe(true)
    expect(aliasesData.keywordAliases.some(row => row.baseKeyword === 'Kanaut Nishe')).toBe(false)
    expect(aliasesData.keywordAliases.some(row => row.baseKeyword === 'maid')).toBe(true)
  })
})
