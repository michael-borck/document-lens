//! SQLite data access — the Rust replacement for electron/database.ts +
//! the db:* IPC handlers in electron/main.ts.
//!
//! Security boundary is preserved verbatim from the Electron design: the
//! renderer sends a query KEY (resolved against the generated registry in
//! db_generated.rs), never SQL. There is no raw-SQL command. Dynamic partial
//! UPDATEs go through `build_update` with a per-table column allowlist; the
//! variable-length `IN (...)` case goes through `build_in_query`.
//!
//! One `Mutex<Connection>` serializes all access — better-sqlite3 was
//! synchronous single-threaded too, so this matches prior behaviour and keeps
//! the WAL writer single.

use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Map, Value as JsonValue};
use tauri::{AppHandle, Manager, State};

use crate::db_generated::{query, updatable_columns, SCHEMA, SCHEMA_VERSION};

/// Managed state: the single open connection.
pub struct Db(pub Mutex<Connection>);

// Reference data for document-attribute autocomplete. Seeded once on an empty
// database. Kept in sync with electron/database.ts DEFAULT_COUNTRIES/INDUSTRIES.
const COUNTRIES: &[(&str, &str)] = &[
    ("AU", "Australia"),
    ("NZ", "New Zealand"),
    ("US", "United States"),
    ("GB", "United Kingdom"),
    ("CA", "Canada"),
    ("DE", "Germany"),
    ("FR", "France"),
    ("JP", "Japan"),
    ("SG", "Singapore"),
    ("CN", "China"),
    ("IN", "India"),
    ("BR", "Brazil"),
    ("ZA", "South Africa"),
];

const INDUSTRIES: &[(&str, &str)] = &[
    ("finance", "Financial Services"),
    ("energy", "Energy"),
    ("utilities", "Utilities"),
    ("tech", "Technology"),
    ("healthcare", "Healthcare"),
    ("industrial", "Industrial"),
    ("materials", "Materials"),
    ("consumer", "Consumer"),
    ("communications", "Communications"),
    ("realestate", "Real Estate"),
    ("mining", "Mining"),
    ("agriculture", "Agriculture"),
    ("transport", "Transport & Logistics"),
    ("education", "Education"),
    ("government", "Government"),
    ("nonprofit", "Non-profit"),
    ("other", "Other"),
];

// ---------------------------------------------------------------------------
// Value conversions: JSON (from the renderer) <-> SQLite
// ---------------------------------------------------------------------------

/// Bind a renderer-supplied JSON value as a SQL parameter. The renderer already
/// coerces booleans to 0/1 and stringifies JSON columns, so arrays/objects are
/// a programming error rather than a bind target.
fn json_to_sql(v: &JsonValue) -> Result<SqlValue, String> {
    Ok(match v {
        JsonValue::Null => SqlValue::Null,
        JsonValue::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(u) = n.as_u64() {
                SqlValue::Integer(u as i64)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                return Err("unsupported numeric parameter".into());
            }
        }
        JsonValue::String(s) => SqlValue::Text(s.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => {
            return Err("cannot bind an array/object as a SQL parameter (stringify JSON columns first)".into())
        }
    })
}

/// Convert a SQLite cell to JSON. Integers/reals become JSON numbers so the
/// renderer's `dbBool`/`parseJson` helpers behave exactly as under Electron.
fn sql_to_json(v: ValueRef<'_>) -> JsonValue {
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).into_owned()),
        // No BLOB columns in the current schema; map to a byte array to mirror
        // better-sqlite3's Buffer -> Uint8Array over IPC if one ever appears.
        ValueRef::Blob(b) => json!(b),
    }
}

fn bind_params(params: &[JsonValue]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(json_to_sql).collect()
}

/// Run a SELECT and return one JSON object per row, keyed by column name
/// (matching better-sqlite3's `.all()`).
fn select_rows(conn: &Connection, sql: &str, params: &[JsonValue]) -> Result<Vec<JsonValue>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let bound = bind_params(params)?;
    let mut rows = stmt
        .query(rusqlite::params_from_iter(bound))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::with_capacity(cols.len());
        for (i, name) in cols.iter().enumerate() {
            let cell = row.get_ref(i).map_err(|e| e.to_string())?;
            obj.insert(name.clone(), sql_to_json(cell));
        }
        out.push(JsonValue::Object(obj));
    }
    Ok(out)
}

/// Run an INSERT/UPDATE/DELETE and return `{ changes, lastInsertRowid }`.
fn run_write(conn: &Connection, sql: &str, params: &[JsonValue]) -> Result<JsonValue, String> {
    let bound = bind_params(params)?;
    let changes = conn
        .execute(sql, rusqlite::params_from_iter(bound))
        .map_err(|e| e.to_string())?;
    Ok(json!({ "changes": changes, "lastInsertRowid": conn.last_insert_rowid() }))
}

// ---------------------------------------------------------------------------
// Query shaping — ports of getInQuery / buildUpdate from electron/queries.ts
// ---------------------------------------------------------------------------

fn build_in_query(key: &str, count: usize) -> Result<String, String> {
    let template = query(key).ok_or_else(|| format!("Unknown query key: {key}"))?;
    if !template.contains("__IN__") {
        return Err(format!("Query {key} is not an IN-list template"));
    }
    let placeholders = if count > 0 {
        std::iter::repeat("?").take(count).collect::<Vec<_>>().join(",")
    } else {
        "NULL".to_string()
    };
    Ok(template.replacen("__IN__", &placeholders, 1))
}

fn build_update(table: &str, columns: &[String], id_column: &str) -> Result<String, String> {
    let allowed = updatable_columns(table).ok_or_else(|| format!("Table not updatable: {table}"))?;
    if columns.is_empty() {
        return Err(format!("No columns to update for {table}"));
    }
    for col in columns {
        if !allowed.contains(&col.as_str()) {
            return Err(format!("Column not updatable: {table}.{col}"));
        }
    }
    if !allowed.contains(&id_column) {
        return Err(format!("Invalid id column: {table}.{id_column}"));
    }
    let set_clause = columns
        .iter()
        .map(|c| format!("{c} = ?"))
        .collect::<Vec<_>>()
        .join(", ");
    Ok(format!("UPDATE {table} SET {set_clause} WHERE {id_column} = ?"))
}

// ---------------------------------------------------------------------------
// Commands — mirror the db:* IPC handlers 1:1
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn db_select(
    db: State<'_, Db>,
    key: String,
    params: Option<Vec<JsonValue>>,
) -> Result<Vec<JsonValue>, String> {
    let sql = query(&key).ok_or_else(|| format!("Unknown query key: {key}"))?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    select_rows(&conn, sql, &params.unwrap_or_default())
}

#[tauri::command]
pub fn db_run(
    db: State<'_, Db>,
    key: String,
    params: Option<Vec<JsonValue>>,
) -> Result<JsonValue, String> {
    let sql = query(&key).ok_or_else(|| format!("Unknown query key: {key}"))?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    run_write(&conn, sql, &params.unwrap_or_default())
}

#[tauri::command]
pub fn db_update(
    db: State<'_, Db>,
    table: String,
    columns: Vec<String>,
    id_column: String,
    params: Option<Vec<JsonValue>>,
) -> Result<JsonValue, String> {
    let sql = build_update(&table, &columns, &id_column)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    run_write(&conn, &sql, &params.unwrap_or_default())
}

#[tauri::command]
pub fn db_select_in(
    db: State<'_, Db>,
    key: String,
    ids: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, String> {
    let sql = build_in_query(&key, ids.len())?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    select_rows(&conn, &sql, &ids)
}

#[derive(serde::Deserialize)]
pub struct BatchOp {
    key: String,
    #[serde(default)]
    params: Option<Vec<JsonValue>>,
}

/// Atomic batch of keyed writes in ONE transaction — a mid-sequence failure
/// rolls the whole group back (e.g. a document without its pages/sections).
#[tauri::command]
pub fn db_run_batch(db: State<'_, Db>, ops: Vec<BatchOp>) -> Result<JsonValue, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for op in &ops {
        let sql = query(&op.key).ok_or_else(|| format!("Unknown query key: {}", op.key))?;
        let bound = bind_params(op.params.as_deref().unwrap_or(&[]))?;
        tx.execute(sql, rusqlite::params_from_iter(bound))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

// ---------------------------------------------------------------------------
// Lifecycle — path, wipe-on-version-bump, pragmas, seed
// ---------------------------------------------------------------------------

/// Opaque timestamp for schema_version.applied_at (never parsed by logic).
fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

/// Read the on-disk schema version, or None if the table/file is absent.
fn read_schema_version(path: &Path) -> Option<i64> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    conn.query_row(
        "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
        [],
        |r| r.get::<_, i64>(0),
    )
    .ok()
}

/// Open (creating/wiping as needed) and return the ready connection. Mirrors
/// electron/database.ts: wipe-on-version-mismatch (greenfield, no migrations),
/// WAL + foreign_keys, apply DDL, stamp version, seed reference data.
pub fn init_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("document-lens.db");

    if db_path.exists() {
        let existing = read_schema_version(&db_path);
        if existing != Some(SCHEMA_VERSION) {
            eprintln!(
                "[db] schema version mismatch (found {existing:?}, expected {SCHEMA_VERSION}); wiping {}",
                db_path.display()
            );
            let _ = std::fs::remove_file(&db_path);
            if let Some(fname) = db_path.file_name().map(|s| s.to_string_lossy().to_string()) {
                for suffix in ["-wal", "-shm"] {
                    let _ = std::fs::remove_file(db_path.with_file_name(format!("{fname}{suffix}")));
                }
            }
        }
    }

    println!("[db] initializing at {}", db_path.display());
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)",
        rusqlite::params![SCHEMA_VERSION, now_stamp()],
    )
    .map_err(|e| e.to_string())?;
    seed_reference_data(&conn)?;
    Ok(conn)
}

fn seed_reference_data(conn: &Connection) -> Result<(), String> {
    let countries: i64 = conn
        .query_row("SELECT COUNT(*) FROM countries", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if countries == 0 {
        for (code, name) in COUNTRIES {
            conn.execute(
                "INSERT INTO countries (code, name) VALUES (?, ?)",
                rusqlite::params![code, name],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let industries: i64 = conn
        .query_row("SELECT COUNT(*) FROM industries", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if industries == 0 {
        for (code, name) in INDUSTRIES {
            conn.execute(
                "INSERT INTO industries (code, name) VALUES (?, ?)",
                rusqlite::params![code, name],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
