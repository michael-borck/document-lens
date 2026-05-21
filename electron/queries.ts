/**
 * Central SQL registry — the security boundary for renderer DB access.
 *
 * The renderer never sends SQL strings over IPC anymore; it sends a KEY
 * into this map. main.ts resolves the key against THIS module, which is
 * compiled into the main-process bundle. A compromised renderer (e.g. via
 * XSS in imported document content) can therefore only invoke queries that
 * already exist here — it cannot inject arbitrary SQL, DDL, or DROP.
 *
 * Keys are namespaced by entity: `<entity>.<operation>` (e.g.
 * `documents.list`, `keywords.deleteById`). SQL is copied verbatim from the
 * service files it replaced — no semantic changes.
 *
 * The one thing renderers legitimately need to vary at runtime is WHICH
 * columns a partial UPDATE writes. That can't be a static string, so it
 * goes through buildUpdate() below with a per-table column allowlist rather
 * than into this map.
 */

export const QUERIES = {
} as const

export type QueryKey = keyof typeof QUERIES

/** Resolve a query key to its SQL, or throw if the key is not registered. */
export function getQuery(key: string): string {
  const sql = (QUERIES as Record<string, string>)[key]
  if (sql === undefined) {
    throw new Error(`Unknown query key: ${key}`)
  }
  return sql
}

/**
 * Per-table column allowlist for dynamic partial UPDATEs. Only these
 * columns may be written via buildUpdate(); anything else throws. Keeps
 * identifier construction in the main process with a fixed allowlist.
 */
const UPDATABLE_COLUMNS: Record<string, ReadonlySet<string>> = {
}

/**
 * Build a validated `UPDATE <table> SET <cols> WHERE <idColumn> = ?`
 * statement. `columns` and `idColumn` are checked against the allowlist;
 * values are bound as parameters by the caller.
 */
export function buildUpdate(
  table: string,
  columns: string[],
  idColumn: string
): string {
  const allowed = UPDATABLE_COLUMNS[table]
  if (!allowed) {
    throw new Error(`Table not updatable: ${table}`)
  }
  if (columns.length === 0) {
    throw new Error(`No columns to update for ${table}`)
  }
  for (const col of columns) {
    if (!allowed.has(col)) {
      throw new Error(`Column not updatable: ${table}.${col}`)
    }
  }
  if (!allowed.has(idColumn)) {
    throw new Error(`Invalid id column: ${table}.${idColumn}`)
  }
  const setClause = columns.map((c) => `${c} = ?`).join(', ')
  return `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`
}
