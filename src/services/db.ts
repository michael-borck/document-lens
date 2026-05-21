/**
 * Typed wrappers over the renderer-side database IPC.
 *
 * The Electron preload exposes three primitives on window.electron:
 *   - dbQuery(sql, params) — returns rows for SELECT, run-result otherwise
 *   - dbRun(sql, params)   — same IPC handler, different return type expected
 *   - dbExec(sql)          — multi-statement DDL
 *
 * The helpers below add type inference and a small ergonomic layer:
 *   - boolish columns (INTEGER 0/1) -> boolean
 *   - JSON columns -> parsed objects
 *   - explicit `runStatement` for INSERT/UPDATE/DELETE that returns
 *     `{ changes, lastInsertRowid }`
 *
 * Services in this folder build on these primitives. No service should
 * call window.electron.dbQuery directly.
 */

import type { DatabaseResult } from '@/types/electron'

function api() {
  const electron = window.electron
  if (!electron) {
    throw new Error('Database IPC not available — window.electron is undefined')
  }
  return electron
}

// ---------------------------------------------------------------------------
// Legacy raw-SQL helpers — DEPRECATED. Being migrated to the keyed helpers
// below; removed once every service references query keys. runStatement now
// routes through dbQuery (the same `db:query` handler the old dbRun used).
// ---------------------------------------------------------------------------

/** Run a SELECT and return typed rows. */
export async function selectAll<T>(sql: string, params?: unknown[]): Promise<T[]> {
  return api().dbQuery<T>(sql, params)
}

/** Run a SELECT and return the first row, or null if no row matches. */
export async function selectOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await api().dbQuery<T>(sql, params)
  return rows[0] ?? null
}

/** Run an INSERT/UPDATE/DELETE statement. Returns DatabaseResult. */
export async function runStatement(sql: string, params?: unknown[]): Promise<DatabaseResult> {
  return api().dbQuery(sql, params) as unknown as Promise<DatabaseResult>
}

// ---------------------------------------------------------------------------
// Keyed helpers — the renderer passes a query KEY (see electron/queries.ts);
// main resolves it to SQL. No SQL crosses the IPC boundary.
// ---------------------------------------------------------------------------

/** Run a registered SELECT and return typed rows. */
export async function selectAllKeyed<T>(key: string, params?: unknown[]): Promise<T[]> {
  return api().dbSelect<T>(key, params)
}

/** Run a registered SELECT and return the first row, or null. */
export async function selectOneKeyed<T>(key: string, params?: unknown[]): Promise<T | null> {
  const rows = await api().dbSelect<T>(key, params)
  return rows[0] ?? null
}

/** Run a registered INSERT/UPDATE/DELETE. Returns DatabaseResult. */
export async function runStatementKeyed(key: string, params?: unknown[]): Promise<DatabaseResult> {
  return api().dbRunKeyed(key, params)
}

/**
 * Run a validated dynamic partial UPDATE. `columns` and `idColumn` are
 * checked against a per-table allowlist in main; `params` must be the
 * column values in `columns` order followed by the id value.
 */
export async function updateRow(
  table: string,
  columns: string[],
  idColumn: string,
  params: unknown[]
): Promise<DatabaseResult> {
  return api().dbUpdate(table, columns, idColumn, params)
}

/**
 * Run a registered SELECT with a variable-length `IN (...)` list. The
 * registry SQL holds an `__IN__` marker expanded in main; `ids` are bound
 * as the IN parameters.
 */
export async function selectInListKeyed<T>(key: string, ids: unknown[]): Promise<T[]> {
  return api().dbSelectIn<T>(key, ids)
}

// ---------------------------------------------------------------------------
// Boolean and JSON column helpers
// ---------------------------------------------------------------------------

export const dbBool = (n: 0 | 1 | number | null | undefined): boolean => Boolean(n)
export const toDbBool = (b: boolean): 0 | 1 => (b ? 1 : 0)

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === '') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export const stringifyJson = (value: unknown): string => JSON.stringify(value)

/** Generate a stable id for new rows. */
export function newId(): string {
  return crypto.randomUUID()
}

/** Current timestamp as ISO 8601 — used for created_at / updated_at columns. */
export function now(): string {
  return new Date().toISOString()
}
