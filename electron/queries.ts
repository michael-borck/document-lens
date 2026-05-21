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
  // documents
  'documents.list': 'SELECT * FROM documents ORDER BY imported_at DESC',
  'documents.getById': 'SELECT * FROM documents WHERE id = ?',
  'documents.getByHash': 'SELECT * FROM documents WHERE file_hash = ?',
  'documents.create': `INSERT INTO documents
       (id, filename, file_path, file_hash, file_size, title, year, company, sector,
        status, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'documents.deleteById': 'DELETE FROM documents WHERE id = ?',
  'documents.countInProject':
    'SELECT COUNT(*) AS n FROM project_documents WHERE project_id = ?',
  'documents.updateFilePath': 'UPDATE documents SET file_path = ? WHERE id = ?',

  // reference
  'reference.listIndustries': 'SELECT code, name FROM industries ORDER BY name',

  // projects
  'projects.list': 'SELECT * FROM projects ORDER BY updated_at DESC',
  'projects.getById': 'SELECT * FROM projects WHERE id = ?',
  'projects.listDocumentIds':
    'SELECT document_id FROM project_documents WHERE project_id = ?',
  'projects.listKeywordListIds':
    'SELECT list_id FROM project_keyword_lists WHERE project_id = ?',
  'projects.listLensIds': 'SELECT lens_id FROM project_lenses WHERE project_id = ?',
  'projects.create': `INSERT INTO projects
       (id, name, description, research_focus, scoring_rule_id, filter_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  'projects.deleteById': 'DELETE FROM projects WHERE id = ?',
  'projects.addDocument':
    'INSERT INTO project_documents (project_id, document_id, added_at) VALUES (?, ?, ?)',
  'projects.addDocumentIgnore': `INSERT OR IGNORE INTO project_documents (project_id, document_id, added_at)
       VALUES (?, ?, ?)`,
  'projects.removeDocument':
    'DELETE FROM project_documents WHERE project_id = ? AND document_id = ?',
  'projects.addKeywordList':
    'INSERT INTO project_keyword_lists (project_id, list_id) VALUES (?, ?)',
  'projects.clearKeywordLists':
    'DELETE FROM project_keyword_lists WHERE project_id = ?',
  'projects.addLens':
    'INSERT INTO project_lenses (project_id, lens_id) VALUES (?, ?)',
  'projects.clearLenses': 'DELETE FROM project_lenses WHERE project_id = ?',
  'projects.touch': 'UPDATE projects SET updated_at = ? WHERE id = ?',

  // lenses
  'lenses.list': 'SELECT * FROM lenses ORDER BY is_builtin DESC, name',
  'lenses.getById': 'SELECT * FROM lenses WHERE id = ?',
  'lenses.listValues':
    'SELECT * FROM lens_values WHERE lens_id = ? ORDER BY sort_order, value',
  'lenses.create': `INSERT INTO lenses (id, name, description, type, is_hierarchical, is_builtin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  'lenses.createValue': `INSERT INTO lens_values
       (id, lens_id, value, display_name, description, parent_value_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  'lenses.getValueById': 'SELECT * FROM lens_values WHERE id = ?',
  'lenses.deleteById': 'DELETE FROM lenses WHERE id = ?',
  'lenses.deleteValueById': 'DELETE FROM lens_values WHERE id = ?',
  'lenses.countProjectsUsing':
    'SELECT COUNT(*) AS n FROM project_lenses WHERE lens_id = ?',

  // scoring rules
  'scoringRules.list': 'SELECT * FROM scoring_rules ORDER BY is_builtin DESC, name',
  'scoringRules.getById': 'SELECT * FROM scoring_rules WHERE id = ?',
  'scoringRules.create': `INSERT INTO scoring_rules
       (id, name, description, is_builtin, definition, output_levels, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  'scoringRules.deleteById': 'DELETE FROM scoring_rules WHERE id = ?',
  'scoringRules.countProjectsUsing':
    'SELECT COUNT(*) AS n FROM projects WHERE scoring_rule_id = ?',
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
  documents: new Set(['title', 'year', 'company', 'sector', 'id']),
  projects: new Set([
    'name',
    'description',
    'research_focus',
    'scoring_rule_id',
    'filter_state',
    'updated_at',
    'id',
  ]),
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
