import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const dbPath = path.join(process.cwd(), 'data', 'commissions.db')

type QueryParams = ReadonlyArray<unknown>

type QueryFunction = <T = unknown>(sql: string, params?: QueryParams) => T[]

type DatabaseCloser = () => void

interface DatabaseHandle {
  queryAll: QueryFunction
  close: DatabaseCloser
}

interface BunSqliteModule {
  Database: new (
    file: string,
    options?: { readonly?: boolean },
  ) => {
    query: (sql: string) => {
      all: <TRow = unknown>(params?: QueryParams) => TRow[]
    }
    close: () => void
  }
}

interface BetterSqlite3Database {
  prepare: (sql: string) => {
    all: <TRow = unknown>(params?: QueryParams) => TRow[]
  }
  close: () => void
}

type BetterSqlite3Constructor = new (
  file: string,
  options?: { readonly?: boolean, fileMustExist?: boolean },
) => BetterSqlite3Database

let cachedDatabaseHandle: DatabaseHandle | null = null

function openDatabase(): DatabaseHandle {
  if (process.versions.bun) {
    const { Database } = require('bun:sqlite') as BunSqliteModule
    const db = new Database(dbPath, { readonly: true })
    return {
      queryAll: <T = unknown>(sql: string, params: QueryParams = []) =>
        db.query(sql).all(params) as T[],
      close: () => db.close(),
    }
  }

  const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Constructor
  const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true })
  return {
    queryAll: <T = unknown>(sql: string, params: QueryParams = []) =>
      db.prepare(sql).all(params) as T[],
    close: () => db.close(),
  }
}

function getDatabaseHandle(): DatabaseHandle {
  if (!cachedDatabaseHandle) {
    cachedDatabaseHandle = openDatabase()
  }

  return cachedDatabaseHandle
}

export function queryAll<T = unknown>(sql: string, params: QueryParams = []): T[] {
  return getDatabaseHandle().queryAll<T>(sql, params)
}
