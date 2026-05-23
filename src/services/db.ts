/**
 * Typed wrappers over the renderer-side database IPC.
 *
 * The renderer never sends SQL over IPC — it passes a query KEY into the
 * registry in electron/queries.ts, which main resolves to SQL from its own
 * bundled copy. This is the security boundary: a compromised renderer can
 * only invoke queries that already exist in the registry, never inject its
 * own SQL/DDL. See that module's docstring for the threat model.
 *
 * The helpers below add type inference and a small ergonomic layer:
 *   - boolish columns (INTEGER 0/1) -> boolean
 *   - JSON columns -> parsed objects
 *   - explicit `runStatement` for INSERT/UPDATE/DELETE that returns
 *     `{ changes, lastInsertRowid }`
 *
 * Services in this folder build on these primitives. No service should
 * call window.electron.db* directly.
 */

import type { DatabaseResult } from '@/types/electron'

/**
 * The swappable backing store behind the helpers below. In production the
 * default {@link ipcDriver} forwards to `window.electron` (which sends query
 * KEYS over IPC; main resolves them against the Query Registry). Tests call
 * {@link setDbDriver} with an in-memory adapter that runs the same registry
 * against better-sqlite3 — making this interface a reachable test surface.
 *
 * Two adapters keep the seam honest: IPC in prod, in-memory in tests.
 */
export interface DbDriver {
  select<T>(key: string, params?: unknown[]): Promise<T[]>
  run(key: string, params?: unknown[]): Promise<DatabaseResult>
  update(table: string, columns: string[], idColumn: string, params: unknown[]): Promise<DatabaseResult>
  selectIn<T>(key: string, ids: unknown[]): Promise<T[]>
}

/** Production driver: forwards to the preload IPC bridge. */
const ipcDriver: DbDriver = {
  select: (key, params) => requireElectron().dbSelect(key, params),
  run: (key, params) => requireElectron().dbRunKeyed(key, params),
  update: (table, columns, idColumn, params) =>
    requireElectron().dbUpdate(table, columns, idColumn, params),
  selectIn: (key, ids) => requireElectron().dbSelectIn(key, ids),
}

function requireElectron() {
  const electron = window.electron
  if (!electron) {
    throw new Error('Database IPC not available — window.electron is undefined')
  }
  return electron
}

let driver: DbDriver = ipcDriver

/** Swap the backing store. Used by tests to inject the in-memory adapter. */
export function setDbDriver(next: DbDriver): void {
  driver = next
}

/** Restore the default IPC driver. */
export function resetDbDriver(): void {
  driver = ipcDriver
}

/** Run a registered SELECT and return typed rows. */
export async function selectAll<T>(key: string, params?: unknown[]): Promise<T[]> {
  return driver.select<T>(key, params)
}

/** Run a registered SELECT and return the first row, or null. */
export async function selectOne<T>(key: string, params?: unknown[]): Promise<T | null> {
  const rows = await driver.select<T>(key, params)
  return rows[0] ?? null
}

/** Run a registered INSERT/UPDATE/DELETE. Returns DatabaseResult. */
export async function runStatement(key: string, params?: unknown[]): Promise<DatabaseResult> {
  return driver.run(key, params)
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
  return driver.update(table, columns, idColumn, params)
}

/**
 * Run a registered SELECT with a variable-length `IN (...)` list. The
 * registry SQL holds an `__IN__` marker expanded in main; `ids` are bound
 * as the IN parameters.
 */
export async function selectInList<T>(key: string, ids: unknown[]): Promise<T[]> {
  return driver.selectIn<T>(key, ids)
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
