import type { D1DatabaseLike, D1PreparedStatementLike } from '../src/adminPersistence'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { onTestFinished } from 'vitest'

export function createSQLiteD1({ failAtBatchStatement }: { failAtBatchStatement?: number } = {}) {
  const database = new DatabaseSync(':memory:')
  onTestFinished(() => database.close())
  const migrationsDirectory = path.resolve(import.meta.dirname, '../migrations')
  for (const name of readdirSync(migrationsDirectory).filter(name => name.endsWith('.sql')).sort()) {
    database.exec(readFileSync(path.join(migrationsDirectory, name), 'utf8'))
  }

  let batchCalls = 0
  function prepare(query: string, values: unknown[] = []): D1PreparedStatementLike {
    return {
      bind: (...nextValues) => prepare(query, nextValues),
      async all<TRow>() {
        return { results: database.prepare(query).all(...values as never[]) as TRow[] }
      },
      async run() {
        database.prepare(query).run(...values as never[])
        return { success: true }
      },
    }
  }

  const db: D1DatabaseLike = {
    prepare,
    async batch(statements) {
      batchCalls += 1
      database.exec('BEGIN')
      try {
        const results = []
        for (const [index, statement] of statements.entries()) {
          if (index + 1 === failAtBatchStatement)
            throw new Error('Injected batch statement failure.')
          results.push(await statement.run())
        }
        database.exec('COMMIT')
        return results
      }
      catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
  }

  return { database, db, batchCallCount: () => batchCalls }
}
