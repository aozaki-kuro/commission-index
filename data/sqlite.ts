import path from 'node:path'
import { createRequire } from 'node:module'

declare const Bun: undefined | Record<string, unknown>

const require = createRequire(import.meta.url)
const dbPath = path.join(process.cwd(), 'data', 'commissions.db')

type QueryParams = ReadonlyArray<unknown>

type QueryFunction = <T = unknown>(sql: string, params?: QueryParams) => T[]

type DatabaseCloser = () => void

type DatabaseHandle = {
  queryAll: QueryFunction
  close: DatabaseCloser
}

type BunSqliteModule = {
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

type BetterSqlite3Database = {
  prepare: (sql: string) => {
    all: <TRow = unknown>(params?: QueryParams) => TRow[]
  }
  close: () => void
}

type BetterSqlite3Constructor = new (
  file: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => BetterSqlite3Database

let cachedDatabaseHandle: DatabaseHandle | null = null

const openDatabase = (): DatabaseHandle => {
  if (typeof Bun !== 'undefined') {
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

const getDatabaseHandle = (): DatabaseHandle => {
  if (!cachedDatabaseHandle) {
    cachedDatabaseHandle = openDatabase()
  }

  return cachedDatabaseHandle
}

export const queryAll = <T = unknown>(sql: string, params: QueryParams = []): T[] =>
  getDatabaseHandle().queryAll<T>(sql, params)
