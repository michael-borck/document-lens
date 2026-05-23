import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { SCHEMA, SCHEMA_VERSION } from './schema'

let db: Database.Database | null = null

// The schema contract (SCHEMA + SCHEMA_VERSION) lives in ./schema.ts so that
// node tests can build an in-memory database from the exact same DDL the main
// process ships. This module keeps the Electron-bound lifecycle: path
// resolution, wipe-on-bump, and reference-data seeding.

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
