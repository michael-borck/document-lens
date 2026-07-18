//! Path guard for the fs_* commands — the filesystem security boundary.
//!
//! Faithful port of electron/fs-guard.ts. The renderer can ask Rust to
//! read/write absolute paths; without a guard a compromised renderer (XSS from
//! imported document content) could read ~/.ssh/id_rsa or overwrite a
//! LaunchAgent. Operations are confined to:
//!   - the app-data subtree (DB, caches, imports);
//!   - files/dirs the user explicitly picked via a native dialog THIS session;
//!   - (reads only) paths registered as a document source in the DB, so the
//!     PDF viewer and bundle export can reach originals across restarts.
//!
//! The dialog allowlist is in-memory and per-session by design: the renderer
//! can't widen it without going through a real dialog (user interaction).

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::db::Db;

/// Managed state: the session's dialog allowlist plus the app-data root.
pub struct FsGuard {
    inner: Mutex<GuardState>,
}

struct GuardState {
    /// Files picked via open-file or targeted via save-file this session.
    dialog_files: HashSet<PathBuf>,
    /// Directories picked this session (allowed as prefixes — anything beneath).
    dialog_dirs: HashSet<PathBuf>,
    /// The app-data subtree root (always allowed).
    app_data_root: PathBuf,
}

impl FsGuard {
    pub fn new(app: &AppHandle) -> Self {
        let app_data_root = app
            .path()
            .app_data_dir()
            .map(|p| normalize_lexical(&p))
            .unwrap_or_default();
        FsGuard {
            inner: Mutex::new(GuardState {
                dialog_files: HashSet::new(),
                dialog_dirs: HashSet::new(),
                app_data_root,
            }),
        }
    }

    pub fn remember_files(&self, paths: &[String]) {
        if let Ok(mut s) = self.inner.lock() {
            for p in paths {
                s.dialog_files.insert(normalize_lexical(Path::new(p)));
            }
        }
    }

    pub fn remember_dirs(&self, paths: &[String]) {
        if let Ok(mut s) = self.inner.lock() {
            for p in paths {
                s.dialog_dirs.insert(normalize_lexical(Path::new(p)));
            }
        }
    }

    /// Resolve + authorise a write. Allowed: the app-data subtree, a picked
    /// directory, or an exact file chosen in a dialog this session.
    pub fn assert_writable(&self, path: &str) -> Result<PathBuf, String> {
        let resolved = normalize_lexical(Path::new(path));
        let s = self.inner.lock().map_err(|e| e.to_string())?;
        if is_within_allowed_dir(&resolved, &s) || s.dialog_files.contains(&resolved) {
            return Ok(resolved);
        }
        Err(format!("Refused: write to a path outside the permitted set: {path}"))
    }

    /// Resolve + authorise a read. Everything a write allows, plus any path the
    /// DB already knows as a document source (checked against the raw path).
    pub fn assert_readable(&self, db: &State<'_, Db>, path: &str) -> Result<PathBuf, String> {
        let resolved = normalize_lexical(Path::new(path));
        {
            let s = self.inner.lock().map_err(|e| e.to_string())?;
            if is_within_allowed_dir(&resolved, &s) || s.dialog_files.contains(&resolved) {
                return Ok(resolved);
            }
        } // release guard lock before touching the DB (avoid lock nesting)
        if is_registered_document(db, path) {
            return Ok(resolved);
        }
        Err(format!("Refused: read of a path outside the permitted set: {path}"))
    }
}

fn is_within_allowed_dir(resolved: &Path, s: &GuardState) -> bool {
    if is_under(resolved, &s.app_data_root) {
        return true;
    }
    s.dialog_dirs.iter().any(|dir| is_under(resolved, dir))
}

/// True if `child` is `parent` itself or nested beneath it. Both are lexically
/// normalized (no `..`), so component-wise `starts_with` is a safe containment
/// test — matches the `!rel.startsWith('..')` check in fs-guard.ts.
fn is_under(child: &Path, parent: &Path) -> bool {
    !parent.as_os_str().is_empty() && child.starts_with(parent)
}

/// Lexically resolve a path: absolutize against cwd if relative, then collapse
/// `.` and `..` without touching the filesystem. Mirrors Node's path.resolve
/// as used by fs-guard.ts (which never realpath'd for the allow-check).
fn normalize_lexical(p: &Path) -> PathBuf {
    let abs: PathBuf = if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/"))
            .join(p)
    };
    let mut out = PathBuf::new();
    for comp in abs.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Has the DB ever recorded this exact path as a document source? Matches the
/// raw, as-stored path string (like isRegisteredDocument in electron/main.ts).
fn is_registered_document(db: &State<'_, Db>, raw_path: &str) -> bool {
    let Ok(conn) = db.0.lock() else { return false };
    conn.query_row(
        "SELECT 1 FROM documents WHERE file_path = ? LIMIT 1",
        [raw_path],
        |_| Ok(()),
    )
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_collapses_dot_and_dotdot() {
        assert_eq!(normalize_lexical(Path::new("/a/b/../c")), PathBuf::from("/a/c"));
        assert_eq!(normalize_lexical(Path::new("/a/./b")), PathBuf::from("/a/b"));
        assert_eq!(normalize_lexical(Path::new("/a/b/../../x")), PathBuf::from("/x"));
    }

    #[test]
    fn is_under_is_component_wise() {
        assert!(is_under(Path::new("/a/b/c"), Path::new("/a/b")));
        assert!(is_under(Path::new("/a/b"), Path::new("/a/b"))); // self
        // Prefix-string trap: "/a/bc" must NOT count as under "/a/b".
        assert!(!is_under(Path::new("/a/bc"), Path::new("/a/b")));
        // Empty parent (unresolved app-data root) never contains anything.
        assert!(!is_under(Path::new("/a"), Path::new("")));
    }

    #[test]
    fn dotdot_escape_is_rejected_after_normalization() {
        // A path that lexically escapes the allowed dir must fail containment.
        let allowed = normalize_lexical(Path::new("/data/app"));
        let escaping = normalize_lexical(Path::new("/data/app/../../etc/passwd"));
        assert!(!is_under(&escaping, &allowed));
    }
}
