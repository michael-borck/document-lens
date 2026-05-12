import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null

/**
 * v2 schema version. Bump when the schema changes incompatibly; the
 * database will be wiped and recreated on first launch with the new
 * version. We don't ship migration scripts — no users, no real data to
 * preserve (per "greenfield schema" decision, 2026-05-11).
 *
 * History:
 *   1: initial v2 schema (16 tables)
 *   2: add document_pages (per-page extracted text for future
 *      page-aware concordance and PDF viewer — IA-8, 2026-05-12)
 */
const SCHEMA_VERSION = 2

const SCHEMA = `
-- Sentinel: tells us which schema version a database is on. The presence
-- of this table differentiates a v2 database from the v1 schema (which
-- had no schema_version table).
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Documents live in a global Library (US-X-08). Many projects can
-- reference the same document.
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  file_size INTEGER,
  title TEXT,
  year INTEGER,                       -- nullable: see US-X-06, design decision 4
  company TEXT,
  sector TEXT,
  page_count INTEGER,
  word_count INTEGER,
  extracted_text TEXT,
  pdf_metadata TEXT,                  -- JSON
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'extracting', 'extracted', 'failed')),
  status_error TEXT,
  imported_at TEXT NOT NULL,
  extracted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Per-page extracted text. Wired at import time even though no UI
-- currently displays it — page-aware concordance (US-G-03) and the
-- embedded PDF viewer (US-G-04) both need this, and storing it now
-- means users don't have to re-import their corpus when those land.
-- See IA-8 in docs/design/information-architecture.md.
CREATE TABLE IF NOT EXISTS document_pages (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (document_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_document_pages_doc ON document_pages(document_id);

-- Lenses (Tag Axes). The dimensions along which keyword mentions are
-- classified (SDG, Pillar, Function, etc.).
CREATE TABLE IF NOT EXISTS lenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  type TEXT NOT NULL
    CHECK(type IN ('keyword-attached', 'document-context')),
  is_hierarchical INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Lens values: the discrete categories within a lens. Optionally
-- hierarchical via parent_value_id (e.g., Pillar -> SDG).
CREATE TABLE IF NOT EXISTS lens_values (
  id TEXT PRIMARY KEY,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  parent_value_id TEXT REFERENCES lens_values(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(lens_id, value)
);
CREATE INDEX IF NOT EXISTS idx_lens_values_lens ON lens_values(lens_id);
CREATE INDEX IF NOT EXISTS idx_lens_values_parent ON lens_values(parent_value_id);

-- Keyword lists.
CREATE TABLE IF NOT EXISTS keyword_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('built-in', 'custom')),
  source TEXT,                        -- 'SDGs', 'TCFD', filename, etc.
  parent_list_id TEXT REFERENCES keyword_lists(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Which lenses a keyword list declares (keywords carry values on these).
CREATE TABLE IF NOT EXISTS keyword_list_lenses (
  list_id TEXT NOT NULL REFERENCES keyword_lists(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  PRIMARY KEY (list_id, lens_id)
);

-- Keywords with polarity. Positive and counter keywords live in the
-- same list (US-X-11) distinguished by this column.
CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES keyword_lists(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  polarity TEXT NOT NULL CHECK(polarity IN ('positive', 'counter')),
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_keywords_list ON keywords(list_id);
CREATE INDEX IF NOT EXISTS idx_keywords_polarity ON keywords(list_id, polarity);

-- Tag values for each keyword (which lens values does this keyword carry).
CREATE TABLE IF NOT EXISTS keyword_tags (
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  value_id TEXT NOT NULL REFERENCES lens_values(id) ON DELETE CASCADE,
  PRIMARY KEY (keyword_id, lens_id, value_id)
);
CREATE INDEX IF NOT EXISTS idx_keyword_tags_lens_value ON keyword_tags(lens_id, value_id);

-- Synonyms per keyword. Editable for both built-in and custom keywords
-- (US-D-07) — synonyms are user metadata layered on top of the
-- framework definition, not part of it.
CREATE TABLE IF NOT EXISTS synonyms (
  id TEXT PRIMARY KEY,
  keyword_id TEXT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'user'
    CHECK(source IN ('user', 'ai-suggested-accepted')),
  added_at TEXT NOT NULL,
  UNIQUE(keyword_id, text)
);
CREATE INDEX IF NOT EXISTS idx_synonyms_keyword ON synonyms(keyword_id);

-- Scoring rules. The 5-level Wedding Cake Score is one such rule; users
-- can define more for non-sustainability domains.
CREATE TABLE IF NOT EXISTS scoring_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  definition TEXT NOT NULL,           -- JSON: rule definition
  output_levels TEXT NOT NULL,        -- JSON: array of {value, label, description}
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Projects.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  research_focus TEXT,                -- 'sustainability', 'cybersecurity', etc.
  scoring_rule_id TEXT REFERENCES scoring_rules(id),
  filter_state TEXT,                  -- JSON: persisted filter prefs
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Project documents (many-to-many): a project selects a subset of the
-- global Library.
CREATE TABLE IF NOT EXISTS project_documents (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (project_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_project_documents_doc ON project_documents(document_id);

-- Project keyword lists (many-to-many in schema; typically one in
-- practice).
CREATE TABLE IF NOT EXISTS project_keyword_lists (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES keyword_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, list_id)
);

-- Project active lenses (the user picks which lenses to apply per project).
CREATE TABLE IF NOT EXISTS project_lenses (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lens_id TEXT NOT NULL REFERENCES lenses(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, lens_id)
);

-- Cached workflow results. Workflow code reads/writes here so re-opening
-- a project is instant. Cache is invalidated when underlying inputs change.
CREATE TABLE IF NOT EXISTS analysis_cache (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  result TEXT NOT NULL,               -- JSON
  computed_at TEXT NOT NULL,
  PRIMARY KEY (project_id, cache_key)
);

-- Reference data for document-attribute autocomplete.
CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS industries (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
`

const DEFAULT_COUNTRIES = [
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'ZA', name: 'South Africa' },
]

const DEFAULT_INDUSTRIES = [
  { code: 'finance', name: 'Financial Services' },
  { code: 'energy', name: 'Energy' },
  { code: 'utilities', name: 'Utilities' },
  { code: 'tech', name: 'Technology' },
  { code: 'healthcare', name: 'Healthcare' },
  { code: 'industrial', name: 'Industrial' },
  { code: 'materials', name: 'Materials' },
  { code: 'consumer', name: 'Consumer' },
  { code: 'communications', name: 'Communications' },
  { code: 'realestate', name: 'Real Estate' },
  { code: 'mining', name: 'Mining' },
  { code: 'agriculture', name: 'Agriculture' },
  { code: 'transport', name: 'Transport & Logistics' },
  { code: 'education', name: 'Education' },
  { code: 'government', name: 'Government' },
  { code: 'nonprofit', name: 'Non-profit' },
  { code: 'other', name: 'Other' },
]

/**
 * Open the SQLite database. If the on-disk schema is missing or out of
 * date, wipe the file and recreate it (greenfield — no migration scripts
 * per the 2026-05-11 design decision).
 */
export function initDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'document-lens.db')

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  // Check if an existing DB is on an incompatible schema. We do this
  // by opening it briefly to inspect the schema_version table; if it's
  // missing (v1 DB) or returns a different version, delete the file.
  if (fs.existsSync(dbPath)) {
    const existingVersion = readSchemaVersion(dbPath)
    if (existingVersion !== SCHEMA_VERSION) {
      console.log(
        `[db] Schema version mismatch (found ${existingVersion ?? 'none'}, expected ${SCHEMA_VERSION}); wiping ${dbPath}`
      )
      fs.unlinkSync(dbPath)
      // Also remove WAL/SHM files if they exist
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = dbPath + suffix
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar)
      }
    }
  }

  console.log('[db] Initializing database at:', dbPath)

  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)

  // Stamp the schema version (no-op if already present).
  db.prepare(
    'INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)'
  ).run(SCHEMA_VERSION, new Date().toISOString())

  seedReferenceData(db)

  return db
}

/**
 * Inspect an existing database file for its schema_version. Returns the
 * version number if present, null otherwise (which indicates either a v1
 * database or a corrupt file).
 */
function readSchemaVersion(dbPath: string): number | null {
  let probe: Database.Database | null = null
  try {
    probe = new Database(dbPath, { readonly: true, fileMustExist: true })
    const row = probe.prepare(
      "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
    ).get() as { version: number } | undefined
    return row?.version ?? null
  } catch {
    // schema_version table doesn't exist (v1 DB) or the file is unreadable.
    return null
  } finally {
    probe?.close()
  }
}

function seedReferenceData(database: Database.Database) {
  const countryCount = (database.prepare('SELECT COUNT(*) as n FROM countries').get() as { n: number }).n
  if (countryCount === 0) {
    const stmt = database.prepare('INSERT INTO countries (code, name) VALUES (?, ?)')
    const insertAll = database.transaction(() => {
      for (const c of DEFAULT_COUNTRIES) stmt.run(c.code, c.name)
    })
    insertAll()
  }

  const industryCount = (database.prepare('SELECT COUNT(*) as n FROM industries').get() as { n: number }).n
  if (industryCount === 0) {
    const stmt = database.prepare('INSERT INTO industries (code, name) VALUES (?, ?)')
    const insertAll = database.transaction(() => {
      for (const i of DEFAULT_INDUSTRIES) stmt.run(i.code, i.name)
    })
    insertAll()
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase()
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
