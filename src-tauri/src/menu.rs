//! Application menu — Rust port of electron/menu.ts.
//!
//! The bespoke part is Help → Documentation: the same 13 topics as the in-app
//! sidebar (src/pages/Help.tsx). Each item carries a `help:<topic>` id; on
//! click we emit `help:navigate` with the topic, and the renderer routes to
//! /help?topic=<id>. Topic ids MUST match Help.tsx's TOPICS array.
//!
//! Everything else uses Tauri predefined items (undo/redo/cut/copy/paste/…) so
//! we don't reinvent standard editing/window behaviour. "Open User Manual"
//! opens the bundled PDF; "Check for Updates" is wired in Phase 6.

use std::path::PathBuf;

use tauri::menu::{Menu, MenuBuilder, MenuEvent, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

// (id, label) — the `help:` prefix is added when building the item id.
// Grouped exactly like the in-page sidebar, separators between groups.
const START: &[(&str, &str)] = &[("getting-started", "Getting Started")];
const SETUP: &[(&str, &str)] = &[("setup", "Setup Tab")];
const WORKFLOWS: &[(&str, &str)] = &[
    ("coverage", "Coverage"),
    ("map", "Map"),
    ("read", "Read"),
    ("discover", "Discover"),
    ("score", "Score"),
    ("track", "Track"),
    ("compare", "Compare"),
    ("audit", "Audit"),
    ("gap", "Gap"),
];
const SHARING: &[(&str, &str)] = &[
    ("paper-bundle", "Paper-ready Bundle"),
    ("project-bundle", "Project Bundle (.lens)"),
];

const MANUAL_PDF: &str = "Document-Lens-User-Manual.pdf";

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let is_mac = cfg!(target_os = "macos");

    // Documentation submenu — the help topics, grouped with separators. Built
    // inline (rather than via a helper) so the builder's type is inferred.
    let mut doc = SubmenuBuilder::new(app, "Documentation");
    for (i, group) in [START, SETUP, WORKFLOWS, SHARING].iter().enumerate() {
        if i > 0 {
            doc = doc.separator();
        }
        for (id, label) in *group {
            doc = doc.text(format!("help:{id}"), *label);
        }
    }
    let doc = doc.build()?;

    // Help menu.
    let mut help = SubmenuBuilder::new(app, "Help").item(&doc).separator();
    help = help.text("help:manual", "Open User Manual (PDF)");
    if !is_mac {
        // macOS surfaces About + Check for Updates in the App menu instead.
        help = help
            .separator()
            .text("help:updates", "Check for Updates…")
            .about(None);
    }
    let help = help.build()?;

    let mut builder = MenuBuilder::new(app);

    // App menu — macOS only. Quit/Hide/etc. live here by convention on Mac.
    if is_mac {
        let app_menu = SubmenuBuilder::new(app, app.package_info().name.clone())
            .about(None)
            .text("help:updates", "Check for Updates…")
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        builder = builder.item(&app_menu);
    }

    // Edit — standard editing roles.
    let mut edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste();
    if is_mac {
        edit = edit.select_all();
    } else {
        edit = edit.separator().select_all();
    }
    let edit = edit.build()?;

    // Window — minimize / maximize / fullscreen / close.
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .separator()
        .close_window()
        .build()?;

    // File — minimal (the app's project/file ops are in-UI).
    let file = SubmenuBuilder::new(app, "File").close_window().build()?;

    builder = builder.item(&file).item(&edit).item(&window).item(&help);
    builder.build()
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().0.as_str();
    let Some(topic) = id.strip_prefix("help:") else {
        return;
    };
    match topic {
        "manual" => open_manual(app),
        "updates" => { /* wired in Phase 6 (updater) */ }
        // A documentation topic → route the renderer to /help?topic=<id>.
        _ => {
            let _ = app.emit("help:navigate", topic);
        }
    }
}

/// Locate the user-manual PDF. Prod: the bundled resource dir. Dev: walk up
/// from the cwd (the repo root holds the PDF).
fn resolve_manual<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join(MANUAL_PDF);
        if p.exists() {
            return Some(p);
        }
    }
    let cwd = std::env::current_dir().ok()?;
    for ancestor in cwd.ancestors() {
        let p = ancestor.join("document-lens").join(MANUAL_PDF);
        if p.exists() {
            return Some(p);
        }
        let p = ancestor.join(MANUAL_PDF);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn open_manual<R: Runtime>(app: &AppHandle<R>) {
    match resolve_manual(app) {
        Some(path) => {
            if let Err(e) = app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>) {
                eprintln!("[menu] failed to open user manual: {e}");
            }
        }
        None => eprintln!("[menu] user manual PDF not found"),
    }
}
