//! Document Lens — Tauri core (Phase 0 scaffold).
//!
//! This is the Rust replacement for the Electron main process. Phase 0 wires
//! up the window and a single real command (`app_get_version`) to prove the
//! renderer ↔ Rust IPC pipe end-to-end. Subsequent phases add modules here:
//!
//!   db.rs        — rusqlite + the keyed query registry (generated from
//!                  electron/queries.ts) + buildUpdate allowlist
//!   fs_guard.rs  — the filesystem allowlist boundary
//!   fs.rs        — fs_read_file / fs_write_file / stats / hash
//!   dialog.rs    — open/save/folder pickers + recursive importable walk
//!   backend.rs   — Python sidecar supervisor (token, health, port reclaim)
//!   menu.rs      — native application menu + help navigation
//!
//! Every command mirrors a method on the renderer's `window.electron`
//! contract (see src/lib/desktop-bridge.ts).

/// Return the app version — mirrors Electron's `app.getVersion()`.
/// The bridge maps `window.electron.getVersion()` → `invoke('app_get_version')`.
#[tauri::command]
fn app_get_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Renderer → terminal logging.
///
/// Electron piped renderer console output to the terminal running `npm run
/// dev`; a Tauri webview does not — its console only exists inside the
/// webview inspector. During the migration that matters: the most common
/// failure is a renderer throwing on a not-yet-ported `window.electron`
/// method, and with no console the only symptom is a blank window. The bridge
/// forwards uncaught errors and rejections here so they surface next to the
/// Rust logs. See src/lib/desktop-bridge.ts.
#[tauri::command]
fn app_log(level: String, message: String) {
    println!("[renderer:{level}] {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance: two instances would fight over the backend port
        // (8765) and the SQLite database — same rationale as the Electron
        // requestSingleInstanceLock. The callback focuses the existing window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![app_get_version, app_log])
        .run(tauri::generate_context!())
        .expect("error while running Document Lens");
}
