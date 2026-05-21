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

  // project-document selects (compute workflows)
  'documents.byProjectOrdered': `SELECT d.* FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.year, d.title, d.filename`,
  'documents.byProject': `SELECT d.* FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?`,
  'documents.byProjectImportOrder': `SELECT d.* FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.imported_at`,

  // keyword tags
  'keywords.tagsForList': `SELECT kt.keyword_id, kt.value_id
       FROM keyword_tags kt
       JOIN keywords k ON k.id = kt.keyword_id
      WHERE k.list_id = ? AND kt.lens_id = ?`,
  'keywords.idsByLensValue': `SELECT kt.keyword_id
       FROM keyword_tags kt
      WHERE kt.lens_id = ? AND kt.value_id = ?`,

  // lens / keyword-list selects (compute + bundle export)
  'lenses.getIdName': 'SELECT id, name FROM lenses WHERE id = ?',
  'lenses.byProject': `SELECT l.* FROM lenses l
       JOIN project_lenses pl ON pl.lens_id = l.id
      WHERE pl.project_id = ?
      ORDER BY l.name`,
  'keywordLists.byProject': `SELECT kl.* FROM keyword_lists kl
       JOIN project_keyword_lists pkl ON pkl.list_id = kl.id
      WHERE pkl.project_id = ?
      ORDER BY kl.name`,

  // track — distinct attribute values (static per-column variants of the
  // former d.company/d.sector dynamic select)
  'track.distinctCompanyInProject': `SELECT DISTINCT d.company AS value
         FROM documents d
         JOIN project_documents pd ON pd.document_id = d.id
        WHERE pd.project_id = ?
          AND d.company IS NOT NULL
          AND TRIM(d.company) != ''
        ORDER BY value`,
  'track.distinctSectorInProject': `SELECT DISTINCT d.sector AS value
         FROM documents d
         JOIN project_documents pd ON pd.document_id = d.id
        WHERE pd.project_id = ?
          AND d.sector IS NOT NULL
          AND TRIM(d.sector) != ''
        ORDER BY value`,

  // document pages (Read concordance + bundle export)
  'documentPages.byDocument':
    'SELECT page_number, text FROM document_pages WHERE document_id = ? ORDER BY page_number',

  // ngrams (Discover)
  'ngrams.projectDocText': `SELECT d.id, d.title, d.filename, d.year, d.extracted_text
           FROM documents d
           JOIN project_documents pd ON pd.document_id = d.id
          WHERE pd.project_id = ? AND d.id = ? AND d.extracted_text IS NOT NULL`,
  'ngrams.projectText': `SELECT d.id, d.title, d.filename, d.year, d.extracted_text
           FROM documents d
           JOIN project_documents pd ON pd.document_id = d.id
          WHERE pd.project_id = ? AND d.extracted_text IS NOT NULL`,

  // bundle export (paper-ready)
  'bundleExport.projectDocs': `SELECT d.id, d.title, d.filename, d.year, d.company, d.sector
       FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.year, d.company, d.title, d.filename`,

  // classification (Function inference)
  'classification.projectDocText': `SELECT d.id, d.extracted_text
       FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?`,
  'classification.projectDocsForClassify': `SELECT d.id, d.filename, d.title, d.extracted_text
       FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.imported_at`,

  // keyword lists
  'keywordLists.list': 'SELECT * FROM keyword_lists ORDER BY type, name',
  'keywordLists.getById': 'SELECT * FROM keyword_lists WHERE id = ?',
  'keywordLists.create': `INSERT INTO keyword_lists
       (id, name, description, type, source, parent_list_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  'keywordLists.deleteById': 'DELETE FROM keyword_lists WHERE id = ?',
  'keywordLists.clearLenses': 'DELETE FROM keyword_list_lenses WHERE list_id = ?',
  'keywordLists.addLens':
    'INSERT INTO keyword_list_lenses (list_id, lens_id) VALUES (?, ?)',
  'keywordLists.listLensIds':
    'SELECT lens_id FROM keyword_list_lenses WHERE list_id = ?',

  // keywords
  'keywords.listByList':
    'SELECT * FROM keywords WHERE list_id = ? ORDER BY polarity, sort_order, text',
  'keywords.create': `INSERT INTO keywords (id, list_id, text, polarity, enabled, notes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  'keywords.getById': 'SELECT * FROM keywords WHERE id = ?',
  'keywords.setEnabled': 'UPDATE keywords SET enabled = ? WHERE id = ?',
  'keywords.deleteById': 'DELETE FROM keywords WHERE id = ?',
  'keywords.listTags': 'SELECT * FROM keyword_tags WHERE keyword_id = ?',
  'keywords.addTag':
    'INSERT OR IGNORE INTO keyword_tags (keyword_id, lens_id, value_id) VALUES (?, ?, ?)',
  'keywords.clearTagsForLens':
    'DELETE FROM keyword_tags WHERE keyword_id = ? AND lens_id = ?',

  // synonyms
  'synonyms.listByKeyword':
    'SELECT * FROM synonyms WHERE keyword_id = ? ORDER BY added_at',
  'synonyms.create': `INSERT INTO synonyms (id, keyword_id, text, enabled, source, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  'synonyms.getById': 'SELECT * FROM synonyms WHERE id = ?',
  'synonyms.deleteById': 'DELETE FROM synonyms WHERE id = ?',
  'synonyms.setEnabled': 'UPDATE synonyms SET enabled = ? WHERE id = ?',
  // __IN__ is expanded to a `?,?,…` placeholder list in main (db:selectInList).
  'synonyms.byKeywordIds':
    'SELECT keyword_id, text FROM synonyms WHERE keyword_id IN (__IN__)',
  'synonyms.enabledByKeywordIds':
    'SELECT keyword_id, text FROM synonyms WHERE enabled = 1 AND keyword_id IN (__IN__)',

  // sections
  'sections.listByDocument':
    'SELECT * FROM document_sections WHERE document_id = ? ORDER BY section_index',
  'sections.deleteByDocument': 'DELETE FROM document_sections WHERE document_id = ?',
  'sections.create': `INSERT INTO document_sections
         (id, document_id, section_index, start_offset, end_offset, text, classified_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  'sections.findForOffset': `SELECT * FROM document_sections
       WHERE document_id = ? AND start_offset <= ? AND end_offset > ?
       LIMIT 1`,
  'sections.markClassified':
    'UPDATE document_sections SET classified_at = ? WHERE id = ?',
  'sections.setTag': `INSERT INTO section_lens_tags (section_id, lens_id, value_id, confidence)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (section_id, lens_id, value_id) DO UPDATE SET confidence = excluded.confidence`,
  'sections.clearTagsForLens': `DELETE FROM section_lens_tags
       WHERE lens_id = ?
         AND section_id IN (SELECT id FROM document_sections WHERE document_id = ?)`,
  'sections.tagsForDocument': `SELECT slt.section_id, slt.value_id, slt.confidence
       FROM section_lens_tags slt
       JOIN document_sections ds ON ds.id = slt.section_id
      WHERE ds.document_id = ? AND slt.lens_id = ?`,
  'sections.countClassified': `SELECT COUNT(DISTINCT slt.section_id) AS n
       FROM section_lens_tags slt
       JOIN document_sections ds ON ds.id = slt.section_id
      WHERE ds.document_id = ? AND slt.lens_id = ?`,

  // audit (Anomalies/Confirmations + result cache)
  'audit.projectDocs': `SELECT d.id, d.filename, d.title, d.year, d.extracted_text
       FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.imported_at`,
  'audit.getCache':
    'SELECT result FROM analysis_cache WHERE project_id = ? AND cache_key = ?',
  'audit.writeCache': `INSERT INTO analysis_cache (project_id, cache_key, result, computed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (project_id, cache_key)
       DO UPDATE SET result = excluded.result, computed_at = excluded.computed_at`,

  // document pages (write — import + bundle import)
  'documentPages.insert':
    'INSERT INTO document_pages (document_id, page_number, text) VALUES (?, ?, ?)',
  'documentPages.deleteByDocument': 'DELETE FROM document_pages WHERE document_id = ?',

  // bundle import
  'projects.listNames': 'SELECT name FROM projects',
  'bundleImport.updateLensValueParent':
    'UPDATE lens_values SET parent_value_id = ? WHERE id = ?',
  'bundleImport.insertDocument': `INSERT INTO documents
           (id, filename, file_path, file_hash, file_size, title, year, company, sector,
            page_count, word_count, extracted_text, pdf_metadata, status, status_error,
            imported_at, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'bundleImport.insertSection': `INSERT INTO document_sections
             (id, document_id, section_index, start_offset, end_offset, text, classified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,

  // import (extraction pipeline)
  'import.updateExtraction': `UPDATE documents
         SET title = ?,
             year = ?,
             company = ?,
             page_count = ?,
             word_count = ?,
             extracted_text = ?,
             pdf_metadata = ?,
             status = 'extracted',
             status_error = NULL,
             extracted_at = ?
       WHERE id = ?`,
  'import.markFailed': `UPDATE documents SET status = 'failed', status_error = ? WHERE id = ?`,
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
  keywords: new Set(['text', 'polarity', 'notes', 'sort_order', 'id']),
}

/**
 * Resolve a query whose SQL contains the `__IN__` marker into a concrete
 * statement with `count` parameter placeholders, for variable-length
 * `WHERE col IN (...)` lookups. Throws if the key isn't an IN-template.
 */
export function getInQuery(key: string, count: number): string {
  const template = getQuery(key)
  if (!template.includes('__IN__')) {
    throw new Error(`Query ${key} is not an IN-list template`)
  }
  const placeholders = count > 0 ? new Array(count).fill('?').join(',') : 'NULL'
  return template.replace('__IN__', placeholders)
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
