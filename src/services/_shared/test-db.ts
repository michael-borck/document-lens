/**
 * In-memory DbDriver adapter + seed helpers for service tests.
 *
 * The adapter runs the SAME Query Registry (electron/queries.ts) against an
 * in-memory database built from the SAME schema (electron/schema.ts) the main
 * process ships. So a test exercises the real SQL — the two adapters (IPC in
 * prod, this in tests) can't drift.
 *
 * Backed by node:sqlite (DatabaseSync) rather than better-sqlite3 on purpose:
 * the production better-sqlite3 binary is rebuilt for Electron's ABI by the
 * install-app-deps postinstall, so it won't load under plain node/vitest.
 * node:sqlite is built into node, needs no native rebuild, and is real SQLite
 * — same dialect, so fidelity holds. (Experimental in node 22; prints one
 * ExperimentalWarning.)
 *
 * Usage:
 *   const t = createTestDb()
 *   setDbDriver(t.driver)
 *   const pid = t.project()
 *   const did = t.document({ extractedText: 'clean energy …' })
 *   t.addDocToProject(pid, did)
 *   // … call a service, assert …
 *   t.close(); resetDbDriver()
 */

import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { SCHEMA } from '../../db/schema'
import { getQuery, getInQuery, buildUpdate } from '../../db/queries'
import type { DbDriver } from '../db'

// Load node:sqlite via require so Vite's ESM resolver doesn't try to bundle the
// builtin (it strips the `node:` prefix and fails to find a `sqlite` package).
// The type-only import above is erased at compile time.
const { DatabaseSync: SqliteDb } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

const ISO = '2024-01-01T00:00:00.000Z'

/** Values node:sqlite accepts for positional `?` binds. */
type Bindable = null | number | bigint | string | Uint8Array
function bind(params?: unknown[]): Bindable[] {
  return (params ?? []) as Bindable[]
}

export interface TestDb {
  db: DatabaseSync
  driver: DbDriver
  close(): void

  // ── seed helpers (raw inserts; the SELECT side under test uses the registry) ──
  project(opts?: { name?: string; scoringRuleId?: string; researchFocus?: string }): string
  document(opts?: {
    filename?: string
    title?: string | null
    year?: number | null
    company?: string | null
    sector?: string | null
    extractedText?: string | null
    /** null models a document whose word count was never stored. */
    wordCount?: number | null
    status?: string
  }): string
  addDocToProject(projectId: string, documentId: string): void
  keywordList(opts?: { name?: string; type?: string }): string
  projectKeywordList(projectId: string, listId: string): void
  declareListLens(listId: string, lensId: string): void
  keyword(
    listId: string,
    text: string,
    polarity?: 'positive' | 'counter',
    opts?: { enabled?: boolean; sortOrder?: number }
  ): string
  synonym(keywordId: string, text: string, enabled?: boolean): string
  lens(opts?: {
    name?: string
    type?: 'keyword-attached' | 'document-context'
    isHierarchical?: boolean
    isBuiltin?: boolean
  }): string
  lensValue(
    lensId: string,
    value: string,
    opts?: { displayName?: string; description?: string; parentValueId?: string | null; sortOrder?: number }
  ): string
  keywordTag(keywordId: string, lensId: string, valueId: string): void
  projectLens(projectId: string, lensId: string): void
  section(
    documentId: string,
    opts: { index: number; start: number; end: number; text: string; classifiedAt?: string | null }
  ): string
  sectionTag(sectionId: string, lensId: string, valueId: string, confidence?: number): void
  scoringRule(opts: {
    name?: string
    isBuiltin?: boolean
    definition: Record<string, unknown>
    outputLevels?: unknown[]
  }): string
}

export function createTestDb(): TestDb {
  const db: DatabaseSync = new SqliteDb(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)

  const driver: DbDriver = {
    async select<T>(key: string, params?: unknown[]): Promise<T[]> {
      return db.prepare(getQuery(key)).all(...bind(params)) as T[]
    },
    async run(key: string, params?: unknown[]) {
      const r = db.prepare(getQuery(key)).run(...bind(params))
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
    },
    async update(table: string, columns: string[], idColumn: string, params: unknown[]) {
      const r = db.prepare(buildUpdate(table, columns, idColumn)).run(...bind(params))
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
    },
    async selectIn<T>(key: string, ids: unknown[]): Promise<T[]> {
      return db.prepare(getInQuery(key, ids.length)).all(...bind(ids)) as T[]
    },
    async runBatch(ops: { key: string; params?: unknown[] }[]): Promise<void> {
      db.exec('BEGIN')
      try {
        for (const op of ops) {
          db.prepare(getQuery(op.key)).run(...bind(op.params))
        }
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
  }

  function insert(table: string, row: Record<string, unknown>): void {
    const cols = Object.keys(row)
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    db.prepare(sql).run(...bind(cols.map((c) => row[c])))
  }

  const bool = (b: boolean | undefined, dflt = false) => ((b ?? dflt) ? 1 : 0)
  let hashSeq = 0

  return {
    db,
    driver,
    close: () => db.close(),

    project(opts = {}) {
      const id = randomUUID()
      insert('projects', {
        id,
        name: opts.name ?? 'Test Project',
        description: null,
        research_focus: opts.researchFocus ?? 'sustainability',
        scoring_rule_id: opts.scoringRuleId ?? null,
        filter_state: null,
        created_at: ISO,
        updated_at: ISO,
      })
      return id
    },

    document(opts = {}) {
      const id = randomUUID()
      insert('documents', {
        id,
        filename: opts.filename ?? `doc-${id.slice(0, 8)}.pdf`,
        file_path: `/tmp/${id}.pdf`,
        file_hash: `hash-${hashSeq++}`,
        file_size: 1000,
        title: opts.title === undefined ? 'Test Document' : opts.title,
        year: opts.year === undefined ? 2020 : opts.year,
        company: opts.company === undefined ? null : opts.company,
        sector: opts.sector === undefined ? null : opts.sector,
        page_count: 1,
        word_count: opts.wordCount === undefined ? 100 : opts.wordCount,
        extracted_text: opts.extractedText === undefined ? 'placeholder text' : opts.extractedText,
        pdf_metadata: null,
        status: opts.status ?? 'extracted',
        status_error: null,
        imported_at: ISO,
        extracted_at: ISO,
      })
      return id
    },

    addDocToProject(projectId, documentId) {
      insert('project_documents', { project_id: projectId, document_id: documentId, added_at: ISO })
    },

    keywordList(opts = {}) {
      const id = randomUUID()
      insert('keyword_lists', {
        id,
        name: opts.name ?? 'Test Keywords',
        description: null,
        type: opts.type ?? 'built-in',
        source: null,
        parent_list_id: null,
        created_at: ISO,
        updated_at: ISO,
      })
      return id
    },

    projectKeywordList(projectId, listId) {
      insert('project_keyword_lists', { project_id: projectId, list_id: listId })
    },

    declareListLens(listId, lensId) {
      insert('keyword_list_lenses', { list_id: listId, lens_id: lensId })
    },

    keyword(listId, text, polarity = 'positive', opts = {}) {
      const id = randomUUID()
      insert('keywords', {
        id,
        list_id: listId,
        text,
        polarity,
        enabled: bool(opts.enabled, true),
        notes: null,
        sort_order: opts.sortOrder ?? 0,
      })
      return id
    },

    synonym(keywordId, text, enabled = true) {
      const id = randomUUID()
      insert('synonyms', {
        id,
        keyword_id: keywordId,
        text,
        enabled: bool(enabled, true),
        source: 'user',
        added_at: ISO,
      })
      return id
    },

    lens(opts = {}) {
      const id = randomUUID()
      insert('lenses', {
        id,
        name: opts.name ?? `Lens ${id.slice(0, 6)}`,
        description: null,
        type: opts.type ?? 'keyword-attached',
        is_hierarchical: bool(opts.isHierarchical),
        is_builtin: bool(opts.isBuiltin),
        created_at: ISO,
      })
      return id
    },

    lensValue(lensId, value, opts = {}) {
      const id = randomUUID()
      insert('lens_values', {
        id,
        lens_id: lensId,
        value,
        display_name: opts.displayName ?? null,
        description: opts.description ?? null,
        parent_value_id: opts.parentValueId ?? null,
        sort_order: opts.sortOrder ?? 0,
      })
      return id
    },

    keywordTag(keywordId, lensId, valueId) {
      insert('keyword_tags', { keyword_id: keywordId, lens_id: lensId, value_id: valueId })
    },

    projectLens(projectId, lensId) {
      insert('project_lenses', { project_id: projectId, lens_id: lensId })
    },

    section(documentId, opts) {
      const id = randomUUID()
      insert('document_sections', {
        id,
        document_id: documentId,
        section_index: opts.index,
        start_offset: opts.start,
        end_offset: opts.end,
        text: opts.text,
        classified_at: opts.classifiedAt ?? null,
      })
      return id
    },

    sectionTag(sectionId, lensId, valueId, confidence = 1) {
      insert('section_lens_tags', {
        section_id: sectionId,
        lens_id: lensId,
        value_id: valueId,
        confidence,
      })
    },

    scoringRule(opts) {
      const id = randomUUID()
      insert('scoring_rules', {
        id,
        name: opts.name ?? 'Test Rule',
        description: null,
        is_builtin: bool(opts.isBuiltin, true),
        definition: JSON.stringify(opts.definition),
        output_levels: JSON.stringify(opts.outputLevels ?? []),
        created_at: ISO,
        updated_at: ISO,
      })
      return id
    },
  }
}
