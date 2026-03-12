import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('commissionRecords', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.doUnmock('./sqlite')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('caches schema probing across repeated development reads', async () => {
    const queryAll = vi.fn((sql: string) => {
      if (sql.startsWith('PRAGMA table_info(commissions)')) {
        return [{ name: 'keyword' }]
      }

      if (sql.includes('FROM characters')) {
        return [
          {
            id: 1,
            name: 'Lucia',
            status: 'active',
            sort_order: 1,
            file_name: '20260101_creator_lucia',
            links: '[]',
            design: null,
            description: null,
            keyword: 'maid',
            hidden: 0,
          },
        ]
      }

      throw new Error(`unexpected query: ${sql}`)
    })

    vi.doMock('./sqlite', () => ({
      queryAll,
    }))

    const { getCharacterRecords } = await import('./commissionRecords')

    expect(getCharacterRecords()).toHaveLength(1)
    expect(getCharacterRecords()).toHaveLength(1)
    expect(
      queryAll.mock.calls.filter(([sql]) =>
        String(sql).startsWith('PRAGMA table_info(commissions)'),
      ),
    ).toHaveLength(1)
    expect(
      queryAll.mock.calls.filter(([sql]) => String(sql).includes('FROM characters')),
    ).toHaveLength(3)
  })
})
