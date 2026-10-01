// Shared in-memory D1 fixture for admin read-route contract tests.
// Each query branch returns exactly the rows a read-route assertion consumes;
// extend a branch only when a new assertion needs more data.

export function createAdminReadD1Database() {
  const characters = [
    { id: 1, name: 'Alice', status: 'active', sortOrder: 1, commissionCount: 1 },
    { id: 2, name: 'Beta', status: 'archived', sortOrder: 2, commissionCount: 1 },
  ]
  const commissions = [
    {
      id: 10,
      publicId: 'a0ed1441-77c3-4f23-9f81-6d7c3ac95431',
      characterId: 1,
      characterName: 'Alice',
      commissionDate: '2025-03-01',
      creatorName: 'alice-maker',
      workGroupId: null,
      partNumber: null,
      fileName: '20250301_alice-maker',
      links: JSON.stringify(['https://alice.example/a', 'https://alice.example/b']),
      design: 'maid outfit',
      description: 'soft lighting',
      keyword: 'maid, cafe',
      hidden: 0,
    },
    {
      id: 11,
      publicId: 'b1ed1441-77c3-4f23-9f81-6d7c3ac95432',
      characterId: 2,
      characterName: 'Beta',
      commissionDate: '2024-01-05',
      creatorName: 'beta-maker',
      workGroupId: null,
      partNumber: null,
      fileName: '20240105_beta-maker',
      links: JSON.stringify(['https://beta.example/1']),
      design: 'armor',
      description: 'battle scene',
      keyword: 'armor',
      hidden: 1,
    },
  ]

  function queryResults(query: string, values: unknown[]) {
    if (query.includes('sqlite_master')) {
      return [{ name: String(values[1] ?? '') }]
    }

    if (query.includes('PRAGMA table_info(commissions)')) {
      return [{ name: 'keyword' }]
    }

    if (query.includes('COUNT(commissions.id) as commissionCount') && query.includes('characters.status as status')) {
      return characters
    }

    if (query.includes('COUNT(commissions.id) as commissionCount') && query.includes('characters.name as characterName')) {
      return characters.map(item => ({
        characterName: item.name,
        commissionCount: item.commissionCount,
      }))
    }

    if (query.includes('SELECT creator_name as creatorName FROM commissions')) {
      return commissions.map(item => ({ creatorName: item.creatorName }))
    }

    if (query.includes('FROM creator_aliases')) {
      return [{ creatorName: 'maker', aliasesJson: JSON.stringify(['mk']) }]
    }

    if (query.includes('FROM character_aliases')) {
      return [
        { characterName: 'Alice', aliasesJson: JSON.stringify(['Alicia']) },
        { characterName: 'Beta', aliasesJson: JSON.stringify(['B']) },
      ]
    }

    if (query.includes('FROM keyword_aliases')) {
      return [{ baseKeyword: 'maid', aliasesJson: JSON.stringify(['uniform']) }]
    }

    if (query.includes('SELECT keyword FROM commissions')) {
      return commissions.map(item => ({ keyword: item.keyword }))
    }

    if (
      query.includes('commissions.id as id')
      && query.includes('ORDER BY characters.sort_order ASC, commissions.commission_date DESC')
    ) {
      return commissions.map(item => ({
        id: item.id,
        publicId: item.publicId,
        characterId: item.characterId,
        characterName: item.characterName,
        commissionDate: item.commissionDate,
        creatorName: item.creatorName,
        workGroupId: item.workGroupId,
        partNumber: item.partNumber,
        fileName: item.fileName,
        links: item.links,
        design: item.design,
        description: item.description,
        keyword: item.keyword,
        hidden: item.hidden,
      }))
    }

    if (query.includes('FROM home_featured_search_keywords')) {
      return [{ keyword: 'maid' }, { keyword: 'maker' }]
    }

    if (
      query.includes('commissions.file_name as fileName')
      && query.includes('JOIN characters ON characters.id = commissions.character_id')
      && !query.includes('commissions.id as id')
    ) {
      return commissions.map(item => ({
        characterName: item.characterName,
        commissionDate: item.commissionDate,
        creatorName: item.creatorName,
        fileName: item.fileName,
        design: item.design,
        description: item.description,
        keyword: item.keyword,
      }))
    }

    if (query.includes('WHERE commissions.character_id = ?')) {
      const characterId = Number(values[0])
      return commissions
        .filter(item => item.characterId === characterId)
        .map(item => ({
          id: item.id,
          publicId: item.publicId,
          characterId: item.characterId,
          characterName: item.characterName,
          commissionDate: item.commissionDate,
          creatorName: item.creatorName,
          workGroupId: item.workGroupId,
          partNumber: item.partNumber,
          fileName: item.fileName,
          links: item.links,
          design: item.design,
          description: item.description,
          keyword: item.keyword,
          hidden: item.hidden,
        }))
    }

    return []
  }

  function createStatement(query: string, values: unknown[] = []) {
    return {
      bind(...nextValues: unknown[]) {
        return createStatement(query, nextValues)
      },
      async all<TRow>() {
        return {
          results: queryResults(query, values) as TRow[],
        }
      },
      async run() {
        return { success: true }
      },
    }
  }

  return {
    db: {
      prepare(query: string) {
        return createStatement(query)
      },
    },
  }
}
