import type { D1DatabaseLike, D1PreparedStatementLike } from '../src/adminPersistence'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { onTestFinished } from 'vitest'

const D1_MAX_BOUND_PARAMETERS = 100

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
      // SQLite accepts far more variables, so enforce D1's per-statement limit here or tests cannot catch it.
      bind: (...nextValues) => {
        if (nextValues.length > D1_MAX_BOUND_PARAMETERS)
          throw new Error(`D1 allows at most ${D1_MAX_BOUND_PARAMETERS} bound parameters per statement.`)
        return prepare(query, nextValues)
      },
      async all<TRow>() {
        return {
          results: database.prepare(query).all(...values as never[]) as TRow[],
        }
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

  return {
    database,
    db,
    batchCallCount: () => batchCalls,
  }
}
