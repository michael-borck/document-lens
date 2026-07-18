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

mod backend;
mod db;
mod db_generated;
mod fs_guard;
mod menu;
mod platform;

use std::sync::Mutex;
use tauri::{Manager, RunEvent};

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
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Custom application menu (Help → Documentation topics, User Manual).
        .menu(|handle| menu::build(handle))
        .on_menu_event(|app, event| menu::handle(app, event))
        .setup(|app| {
            // Open the database before the renderer can issue db_* commands.
            let conn = db::init_db(&app.handle()).map_err(|e| {
                eprintln!("[db] init failed: {e}");
                e
            })?;
            app.manage(db::Db(Mutex::new(conn)));
            // Filesystem guard: the session dialog allowlist + app-data root.
            app.manage(fs_guard::FsGuard::new(&app.handle()));
            // Analysis backend supervisor: spawns the Python engine, proves
            // readiness, and emits backend:status-changed. Non-fatal on failure
            // — local features still work without it.
            app.manage(backend::Backend::start(&app.handle()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_get_version,
            app_log,
            db::db_select,
            db::db_run,
            db::db_update,
            db::db_select_in,
            db::db_run_batch,
            platform::fs_read_file,
            platform::fs_get_file_stats,
            platform::fs_compute_file_hash,
            platform::fs_write_file,
            platform::dialog_open_file,
            platform::dialog_open_directory,
            platform::dialog_open_folder,
            platform::dialog_save_file,
            platform::shell_open_path,
            platform::shell_open_external,
            platform::app_get_path,
            backend::backend_get_status,
            backend::backend_get_url,
            backend::backend_get_token,
            backend::backend_restart,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Document Lens")
        // Kill the backend's whole process tree on exit so a stranded uvicorn
        // doesn't hold :8765 into the next launch (the Electron before-quit /
        // signal-handler cleanup).
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(b) = app.try_state::<backend::Backend>() {
                    b.shutdown();
                }
            }
        });
}
