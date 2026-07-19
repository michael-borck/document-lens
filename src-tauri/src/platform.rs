//! Filesystem, dialog, shell, and app-path commands — the Rust replacement for
//! the fs:* / dialog:* / shell:* / app:getPath IPC handlers in
//! electron/main.ts. All paths flow through the fs_guard boundary.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde_json::{json, Value as JsonValue};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::db::Db;
use crate::fs_guard::FsGuard;

// Importer-understood extensions — kept in sync with electron/main.ts.
const IMPORTABLE_EXTENSIONS: &[&str] = &["pdf", "docx", "pptx", "txt", "md"];
const MAX_FOLDER_IMPORT_FILES: usize = 5000;

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

/// Read a guarded file, returning raw bytes as an ArrayBuffer to the renderer
/// (tauri::ipc::Response sends bytes efficiently — no number-array bloat).
#[tauri::command]
pub async fn fs_read_file(
    guard: State<'_, FsGuard>,
    db: State<'_, Db>,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let resolved = guard.assert_readable(&db, &path)?;
    let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(&resolved))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn fs_get_file_stats(
    guard: State<'_, FsGuard>,
    db: State<'_, Db>,
    path: String,
) -> Result<JsonValue, String> {
    let resolved = guard.assert_readable(&db, &path)?;
    let md = std::fs::metadata(&resolved).map_err(|e| e.to_string())?;
    let mtime = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    Ok(json!({ "size": md.len(), "mtime": mtime }))
}

#[tauri::command]
pub async fn fs_compute_file_hash(
    guard: State<'_, FsGuard>,
    db: State<'_, Db>,
    path: String,
) -> Result<String, String> {
    let resolved = guard.assert_readable(&db, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let data = std::fs::read(&resolved).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(&data);
        let digest = hasher.finalize();
        let mut hex = String::with_capacity(digest.len() * 2);
        for b in digest {
            hex.push_str(&format!("{b:02x}"));
        }
        Ok::<String, String>(hex)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Write a guarded file. `text` (utf-8) and `bytes` are mutually exclusive —
/// the bridge sends one or the other depending on the JS data type.
#[tauri::command]
pub async fn fs_write_file(
    guard: State<'_, FsGuard>,
    path: String,
    text: Option<String>,
    bytes: Option<Vec<u8>>,
) -> Result<JsonValue, String> {
    let resolved = guard.assert_writable(&path)?;
    let payload: Vec<u8> = match (text, bytes) {
        (Some(t), _) => t.into_bytes(),
        (None, Some(b)) => b,
        (None, None) => Vec::new(),
    };
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&resolved, payload))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

// ---------------------------------------------------------------------------
// Dialogs — run the blocking picker off the main thread (spawn_blocking); the
// guard allowlist is updated after, on the command thread.
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DialogOptions {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    default_path: Option<String>,
    #[serde(default)]
    filters: Option<Vec<DialogFilter>>,
}

#[derive(serde::Deserialize, Clone)]
pub struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

fn to_path_strings(paths: Vec<tauri_plugin_dialog::FilePath>) -> Vec<String> {
    paths
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
pub async fn dialog_open_file(
    app: AppHandle,
    guard: State<'_, FsGuard>,
    options: Option<DialogOptions>,
) -> Result<JsonValue, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut b = app.dialog().file();
        let mut had_filter = false;
        if let Some(o) = &options {
            if let Some(t) = &o.title {
                b = b.set_title(t);
            }
            if let Some(fs) = &o.filters {
                for f in fs {
                    let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                    b = b.add_filter(&f.name, &exts);
                    had_filter = true;
                }
            }
        }
        if !had_filter {
            b = b.add_filter("PDF Documents", &["pdf"]);
        }
        b.blocking_pick_files()
    })
    .await
    .map_err(|e| e.to_string())?;

    match picked {
        Some(paths) => {
            let strs = to_path_strings(paths);
            guard.remember_files(&strs);
            Ok(json!({ "canceled": false, "filePaths": strs }))
        }
        None => Ok(json!({ "canceled": true, "filePaths": [] })),
    }
}

#[tauri::command]
pub async fn dialog_open_directory(
    app: AppHandle,
    guard: State<'_, FsGuard>,
) -> Result<JsonValue, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
        .await
        .map_err(|e| e.to_string())?;
    match picked.and_then(|p| p.into_path().ok()) {
        Some(dir) => {
            let s = dir.to_string_lossy().to_string();
            guard.remember_dirs(&[s.clone()]);
            Ok(json!({ "canceled": false, "filePaths": [s] }))
        }
        None => Ok(json!({ "canceled": true, "filePaths": [] })),
    }
}

/// Pick one or more folders and recursively enumerate importable documents.
/// Faithful port of walkForImportableFiles: dotfile skip, 5000 cap, symlink
/// loop guard via canonicalized visited-set, per-entry error tolerance.
#[tauri::command]
pub async fn dialog_open_folder(
    app: AppHandle,
    guard: State<'_, FsGuard>,
) -> Result<JsonValue, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folders())
        .await
        .map_err(|e| e.to_string())?;

    let folders = match picked {
        Some(f) if !f.is_empty() => to_path_strings(f),
        _ => {
            return Ok(json!({
                "canceled": true, "filePaths": [], "folderCount": 0, "truncated": false
            }))
        }
    };
    guard.remember_dirs(&folders);

    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut file_paths: Vec<String> = Vec::new();
    let mut truncated = false;
    for folder in &folders {
        let (files, t) = walk_importable(Path::new(folder));
        truncated = truncated || t;
        for f in files {
            let key = PathBuf::from(&f);
            if seen.insert(key) {
                file_paths.push(f);
            }
        }
    }
    Ok(json!({
        "canceled": false,
        "filePaths": file_paths,
        "folderCount": folders.len(),
        "truncated": truncated,
    }))
}

#[tauri::command]
pub async fn dialog_save_file(
    app: AppHandle,
    guard: State<'_, FsGuard>,
    options: Option<DialogOptions>,
) -> Result<JsonValue, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut b = app.dialog().file();
        if let Some(o) = &options {
            if let Some(t) = &o.title {
                b = b.set_title(t);
            }
            if let Some(dp) = &o.default_path {
                let p = Path::new(dp);
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    b = b.set_file_name(name);
                }
                if let Some(parent) = p.parent() {
                    if parent.is_dir() {
                        b = b.set_directory(parent);
                    }
                }
            }
            if let Some(fs) = &o.filters {
                for f in fs {
                    let exts: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
                    b = b.add_filter(&f.name, &exts);
                }
            }
        }
        b.blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    match picked.and_then(|p| p.into_path().ok()) {
        Some(path) => {
            let s = path.to_string_lossy().to_string();
            guard.remember_files(&[s.clone()]);
            Ok(json!({ "canceled": false, "filePath": s }))
        }
        None => Ok(json!({ "canceled": true })),
    }
}

fn walk_importable(root: &Path) -> (Vec<String>, bool) {
    let mut files = Vec::new();
    let mut visited: HashSet<PathBuf> = HashSet::new();
    let mut truncated = false;
    walk_dir(root, &mut files, &mut visited, &mut truncated);
    (files, truncated)
}

fn walk_dir(dir: &Path, files: &mut Vec<String>, visited: &mut HashSet<PathBuf>, truncated: &mut bool) {
    if files.len() >= MAX_FOLDER_IMPORT_FILES {
        *truncated = true;
        return;
    }
    let real = match std::fs::canonicalize(dir) {
        Ok(r) => r,
        Err(_) => return, // unreadable — skip, don't fail the whole import
    };
    if !visited.insert(real) {
        return; // symlink loop / already visited
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue; // skip dotfiles/dotdirs
        }
        let full = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_dir() {
            walk_dir(&full, files, visited, truncated);
            if files.len() >= MAX_FOLDER_IMPORT_FILES {
                *truncated = true;
                return;
            }
        } else if ft.is_file() {
            if let Some(ext) = full.extension().and_then(|e| e.to_str()) {
                if IMPORTABLE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()) {
                    if files.len() >= MAX_FOLDER_IMPORT_FILES {
                        *truncated = true;
                        return;
                    }
                    files.push(full.to_string_lossy().to_string());
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shell — open files / external URLs, both guarded (ports the isWebUrl +
// file:// authorisation logic in electron/main.ts).
// ---------------------------------------------------------------------------

fn scheme_of(url: &str) -> Option<String> {
    url.find(':').map(|i| url[..i].to_ascii_lowercase())
}

fn is_web_scheme(scheme: &str) -> bool {
    matches!(scheme, "http" | "https" | "mailto")
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Open a guarded file path with the OS default app. Returns "" on success
/// (matches Electron shell.openPath's success sentinel).
#[tauri::command]
pub fn shell_open_path(
    app: AppHandle,
    guard: State<'_, FsGuard>,
    db: State<'_, Db>,
    path: String,
) -> Result<String, String> {
    let resolved = guard.assert_readable(&db, &path)?;
    app.opener()
        .open_path(resolved.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(String::new())
}

/// Open an external URL. Web/mail schemes go straight to the OS; file:// is
/// allowed only after authorising the underlying path (the #page=N fragment is
/// preserved for the PDF viewer's jump-to-page).
#[tauri::command]
pub fn shell_open_external(
    app: AppHandle,
    guard: State<'_, FsGuard>,
    db: State<'_, Db>,
    url: String,
) -> Result<(), String> {
    let scheme = scheme_of(&url).ok_or_else(|| format!("Refused: malformed URL: {url}"))?;
    if is_web_scheme(&scheme) {
        return app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string());
    }
    if scheme == "file" {
        // Strip scheme + authority, drop the #fragment, percent-decode → the
        // path to authorise. The full url (with fragment) is what we open.
        let after = url.strip_prefix("file://").unwrap_or(&url);
        let path_part = after.split('#').next().unwrap_or(after);
        let decoded = percent_decode(path_part);
        guard.assert_readable(&db, &decoded)?;
        return app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string());
    }
    Err(format!("Refused: disallowed URL scheme: {scheme}"))
}

// ---------------------------------------------------------------------------
// App paths — allowlisted, mirrors app:getPath in electron/main.ts.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn app_get_path(app: AppHandle, name: String) -> Result<String, String> {
    let p = match name.as_str() {
        "userData" => app.path().app_data_dir(),
        "temp" => app.path().temp_dir(),
        "downloads" => app.path().download_dir(),
        "documents" => app.path().document_dir(),
        _ => return Err(format!("Refused: app path not permitted: {name}")),
    }
    .map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scheme_and_web_detection() {
        assert_eq!(scheme_of("https://x.com").as_deref(), Some("https"));
        assert_eq!(scheme_of("mailto:a@b.com").as_deref(), Some("mailto"));
        assert_eq!(scheme_of("FILE:///x").as_deref(), Some("file"));
        assert_eq!(scheme_of("noscheme"), None);
        assert!(is_web_scheme("http") && is_web_scheme("https") && is_web_scheme("mailto"));
        assert!(!is_web_scheme("file") && !is_web_scheme("javascript"));
    }

    #[test]
    fn percent_decode_handles_escapes_and_literals() {
        assert_eq!(percent_decode("/a%20b/c.pdf"), "/a b/c.pdf");
        assert_eq!(percent_decode("/plain/path"), "/plain/path");
        assert_eq!(percent_decode("100%"), "100%"); // trailing % left as-is
    }

    #[test]
    fn walk_finds_importable_skips_dotfiles_and_unknown_ext() {
        let base = std::env::temp_dir().join(format!("dl_walk_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("sub")).unwrap();
        fs::write(base.join("a.pdf"), b"x").unwrap();
        fs::write(base.join("b.TXT"), b"x").unwrap(); // case-insensitive ext
        fs::write(base.join(".hidden.pdf"), b"x").unwrap(); // dotfile — skipped
        fs::write(base.join("note.xyz"), b"x").unwrap(); // unknown ext — skipped
        fs::write(base.join("sub/c.docx"), b"x").unwrap();

        let (mut files, truncated) = walk_importable(&base);
        files.sort();
        let names: Vec<String> = files
            .iter()
            .map(|f| Path::new(f).file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert!(!truncated);
        assert_eq!(names, vec!["a.pdf".to_string(), "b.TXT".to_string(), "c.docx".to_string()]);
        let _ = fs::remove_dir_all(&base);
    }
}
