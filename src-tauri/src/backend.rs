//! Python analysis-backend supervisor — the Rust port of
//! electron/backend-manager.ts.
//!
//! Owns the `document-analyser` child process: spawns it (dev: uvicorn from the
//! sibling repo; prod: the bundled sidecar), proves readiness over HTTP, polls
//! health, and restarts on crash with a bounded backoff. A per-launch bearer
//! token is passed to the child and required on every request except
//! /health and /manifest (lens-contract add_auth); the renderer fetches the
//! same token via `backend_get_token`.
//!
//! Phase transitions are emitted as `backend:status-changed` so the renderer's
//! useBackendStatus gate enables import/analysis the moment the engine is ready.
//!
//! Concurrency: status fields live behind a std Mutex (never held across an
//! await); the child is owned by the supervisor task, killed by pid via the
//! process group (spawned with its own group so the whole tree dies together —
//! the PyInstaller-bootloader orphan defense from the Electron version).

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::{sleep, timeout};

pub const BACKEND_PORT: u16 = 8765;
pub const BACKEND_HOST: &str = "127.0.0.1";

const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);
const HEALTH_INTERVAL: Duration = Duration::from_secs(5);
const MAX_RESTART_ATTEMPTS: u32 = 3;
const RESTART_BACKOFF: Duration = Duration::from_secs(2);

fn backend_url() -> String {
    format!("http://{BACKEND_HOST}:{BACKEND_PORT}")
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    NotStarted,
    Starting,
    Ready,
    Unreachable,
    Crashed,
}

impl Phase {
    fn as_str(self) -> &'static str {
        match self {
            Phase::NotStarted => "not-started",
            Phase::Starting => "starting",
            Phase::Ready => "ready",
            Phase::Unreachable => "unreachable",
            Phase::Crashed => "crashed",
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    phase: String,
    running: bool,
    url: Option<String>,
    pid: Option<u32>,
    mode: String, // "embedded" | "dev-auto"
    last_error: Option<String>,
    started_at: Option<u64>,
}

struct Inner {
    phase: Phase,
    pid: Option<u32>,
    mode: &'static str,
    last_error: Option<String>,
    started_at: Option<u64>,
    restart_attempts: u32,
}

impl Inner {
    fn status(&self) -> BackendStatus {
        BackendStatus {
            phase: self.phase.as_str().to_string(),
            running: self.phase == Phase::Ready,
            url: Some(backend_url()),
            pid: self.pid,
            mode: self.mode.to_string(),
            last_error: self.last_error.clone(),
            started_at: self.started_at,
        }
    }
}

/// Managed state.
pub struct Backend {
    token: String,
    inner: Arc<Mutex<Inner>>,
    shutting_down: Arc<AtomicBool>,
    force_restart: Arc<AtomicBool>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn random_token() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("os rng");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

impl Backend {
    /// Create the supervisor and kick off the spawn+watch task. Non-fatal on
    /// failure — local features still work without the backend.
    pub fn start(app: &AppHandle) -> Self {
        let backend = Backend {
            token: random_token(),
            inner: Arc::new(Mutex::new(Inner {
                phase: Phase::NotStarted,
                pid: None,
                mode: if cfg!(dev) { "dev-auto" } else { "embedded" },
                last_error: None,
                started_at: Some(now_ms()),
                restart_attempts: 0,
            })),
            shutting_down: Arc::new(AtomicBool::new(false)),
            force_restart: Arc::new(AtomicBool::new(false)),
        };

        let app = app.clone();
        let token = backend.token.clone();
        let inner = backend.inner.clone();
        let shutting_down = backend.shutting_down.clone();
        let force_restart = backend.force_restart.clone();
        tauri::async_runtime::spawn(async move {
            supervise(app, token, inner, shutting_down, force_restart).await;
        });

        // Signal handlers (SIGINT/SIGTERM/SIGHUP) — Ctrl-C in the dev terminal,
        // `kill`, or parent death. RunEvent::Exit only fires on a graceful quit,
        // so without this the child (in its own process group) orphans on the
        // port. The reclaim-on-launch path is the backstop; this avoids leaving
        // a zombie between launches. Ports the Electron installSignalHandlers().
        #[cfg(unix)]
        {
            let inner = backend.inner.clone();
            let shutting_down = backend.shutting_down.clone();
            tauri::async_runtime::spawn(async move {
                use tokio::signal::unix::{signal, SignalKind};
                let mut term = signal(SignalKind::terminate()).expect("SIGTERM");
                let mut intr = signal(SignalKind::interrupt()).expect("SIGINT");
                let mut hup = signal(SignalKind::hangup()).expect("SIGHUP");
                tokio::select! {
                    _ = term.recv() => {},
                    _ = intr.recv() => {},
                    _ = hup.recv() => {},
                }
                shutting_down.store(true, Ordering::SeqCst);
                let pid = inner.lock().unwrap().pid;
                if let Some(pid) = pid {
                    kill_group_sync(pid);
                }
                std::process::exit(0);
            });
        }

        backend
    }

    pub fn status(&self) -> BackendStatus {
        self.inner.lock().unwrap().status()
    }

    pub fn token(&self) -> String {
        self.token.clone()
    }

    /// Manual restart: reset the attempt counter and kill the child; the
    /// supervisor loop respawns it. Recovers even after the auto-restart cap.
    pub fn restart(&self) {
        self.force_restart.store(true, Ordering::SeqCst);
        {
            let mut inner = self.inner.lock().unwrap();
            inner.restart_attempts = 0;
        }
        self.kill_current();
    }

    /// Synchronous best-effort kill on app exit.
    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.kill_current();
    }

    fn kill_current(&self) {
        let pid = self.inner.lock().unwrap().pid;
        if let Some(pid) = pid {
            kill_group(pid);
        }
    }
}

fn set_phase(
    app: &AppHandle,
    inner: &Arc<Mutex<Inner>>,
    phase: Phase,
    error: Option<String>,
) {
    let status = {
        let mut i = inner.lock().unwrap();
        if i.phase == phase && i.last_error == error {
            return;
        }
        i.phase = phase;
        i.last_error = error;
        i.status()
    };
    println!("[backend] phase → {}", status.phase);
    let _ = app.emit("backend:status-changed", status);
}

/// The spawn → ready → health → restart loop. Runs for the app's lifetime.
async fn supervise(
    app: AppHandle,
    token: String,
    inner: Arc<Mutex<Inner>>,
    shutting_down: Arc<AtomicBool>,
    force_restart: Arc<AtomicBool>,
) {
    loop {
        if shutting_down.load(Ordering::SeqCst) {
            return;
        }

        // A previous session may have stranded a backend on the port. It
        // answers /health but rejects THIS session's token — reclaim it.
        reclaim_stale_port().await;

        let spec = match resolve_spawn() {
            Ok(s) => s,
            Err(e) => {
                set_phase(&app, &inner, Phase::Crashed, Some(e));
                return; // developer setup error — no point retrying
            }
        };

        set_phase(&app, &inner, Phase::Starting, None);
        let mut child = match spawn_child(&spec, &token) {
            Ok(c) => c,
            Err(e) => {
                set_phase(&app, &inner, Phase::Crashed, Some(format!("spawn failed: {e}")));
                if !backoff_or_stop(&inner, &shutting_down).await {
                    return;
                }
                continue;
            }
        };
        inner.lock().unwrap().pid = child.id();

        // Wait for readiness, racing the child dying during startup.
        let ready = tokio::select! {
            _ = child.wait() => Err("process exited during startup".to_string()),
            r = wait_for_ready(&token) => r,
        };

        match ready {
            Ok(()) => {
                set_phase(&app, &inner, Phase::Ready, None);
                inner.lock().unwrap().restart_attempts = 0;
                // Steady-state health loop; returns when the child exits.
                health_loop(&app, &token, &inner, &mut child).await;
            }
            Err(e) => {
                set_phase(&app, &inner, Phase::Crashed, Some(e));
                kill_group_opt(child.id());
                let _ = child.wait().await;
            }
        }

        inner.lock().unwrap().pid = None;
        if shutting_down.load(Ordering::SeqCst) {
            return;
        }
        // A manual restart is not a crash — respawn immediately, attempts reset.
        if force_restart.swap(false, Ordering::SeqCst) {
            continue;
        }
        if !backoff_or_stop(&inner, &shutting_down).await {
            set_phase(
                &app,
                &inner,
                Phase::Crashed,
                Some("reached max restart attempts; quit and relaunch to retry".into()),
            );
            return;
        }
        set_phase(&app, &inner, Phase::Crashed, Some("process exited".into()));
    }
}

/// Increment the attempt counter and sleep the backoff; return false when the
/// cap is exhausted (caller should stop) or we're shutting down.
async fn backoff_or_stop(inner: &Arc<Mutex<Inner>>, shutting_down: &Arc<AtomicBool>) -> bool {
    let attempts = {
        let mut i = inner.lock().unwrap();
        i.restart_attempts += 1;
        i.restart_attempts
    };
    if attempts > MAX_RESTART_ATTEMPTS {
        return false;
    }
    let delay = RESTART_BACKOFF * attempts;
    println!("[backend] restart attempt {attempts}/{MAX_RESTART_ATTEMPTS} in {delay:?}");
    // Sleep in small slices so shutdown is responsive.
    let mut waited = Duration::ZERO;
    while waited < delay {
        if shutting_down.load(Ordering::SeqCst) {
            return false;
        }
        sleep(Duration::from_millis(200)).await;
        waited += Duration::from_millis(200);
    }
    true
}

/// Poll until the backend verifiably answers as OURS (health + authed probe),
/// or the startup timeout elapses.
async fn wait_for_ready(token: &str) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + STARTUP_TIMEOUT;
    loop {
        sleep(Duration::from_millis(500)).await;
        if verified_health(token).await.is_ok() {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("backend startup timeout".to_string());
        }
    }
}

async fn health_loop(
    app: &AppHandle,
    token: &str,
    inner: &Arc<Mutex<Inner>>,
    child: &mut Child,
) {
    loop {
        tokio::select! {
            _ = child.wait() => return,
            _ = sleep(HEALTH_INTERVAL) => {
                match verified_health(token).await {
                    Ok(()) => set_phase(app, inner, Phase::Ready, None),
                    Err(e) => {
                        // Only downgrade from ready — transient blips shouldn't flap.
                        let was_ready = inner.lock().unwrap().phase == Phase::Ready;
                        if was_ready {
                            set_phase(app, inner, Phase::Unreachable, Some(e));
                        }
                    }
                }
            }
        }
    }
}

/// "Ready" must mean OUR backend: /health is unauthenticated, so a stale server
/// passes it while rejecting real requests. Also require an authed GET / to
/// succeed (401/403 => wrong/stale token).
async fn verified_health(token: &str) -> Result<(), String> {
    let health = http_get("/health", None).await?;
    if health != 200 {
        return Err(format!("health status {health}"));
    }
    let authed = http_get("/", Some(token)).await?;
    if authed == 401 || authed == 403 {
        return Err("backend rejected this session's token (stale backend?)".to_string());
    }
    if authed != 200 {
        return Err(format!("auth probe status {authed}"));
    }
    Ok(())
}

// --- Spawn resolution ------------------------------------------------------

enum SpawnSpec {
    /// (program, args, cwd) for the dev uvicorn path.
    DevUvicorn { program: PathBuf, args: Vec<String>, cwd: PathBuf },
    /// Bundled PyInstaller sidecar (prod).
    Sidecar { program: PathBuf },
}

const DEV_MARKER: &str = "document_analyser/api/__init__.py";
const UVICORN_ARGS: &[&str] = &[
    "-m", "uvicorn", "document_analyser.api:app",
    "--host", BACKEND_HOST,
];

fn resolve_spawn() -> Result<SpawnSpec, String> {
    if cfg!(dev) {
        let repo = find_dev_repo().ok_or_else(|| {
            "dev mode but ../document-analyser sibling not found — clone it beside document-lens".to_string()
        })?;
        let venv = repo.join(".venv/bin/python");
        let venv_win = repo.join(".venv/Scripts/python.exe");
        let program = if venv.exists() {
            venv
        } else if venv_win.exists() {
            venv_win
        } else {
            PathBuf::from("uv") // fall back to `uv run` on PATH
        };
        let mut args: Vec<String> = if program == PathBuf::from("uv") {
            vec!["run".into()]
        } else {
            vec![]
        };
        args.extend(UVICORN_ARGS.iter().map(|s| s.to_string()));
        args.push("--port".into());
        args.push(BACKEND_PORT.to_string());
        return Ok(SpawnSpec::DevUvicorn { program, args, cwd: repo });
    }

    // Bundled sidecar next to the executable (resolved fully in Phase 6).
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no exe dir")?;
    let name = if cfg!(windows) { "document-lens-api.exe" } else { "document-lens-api" };
    let program = dir.join(name);
    if !program.exists() {
        return Err(format!("backend sidecar not found at {}", program.display()));
    }
    Ok(SpawnSpec::Sidecar { program })
}

/// Walk up from the cwd looking for an ancestor that has a `document-analyser`
/// sibling containing the marker. Robust to the dev cwd being src-tauri, the
/// project root, or deeper (the exe lives in the redirected CARGO_TARGET_DIR,
/// so exe-relative resolution can't find the repo).
fn find_dev_repo() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    for ancestor in cwd.ancestors() {
        let candidate = ancestor.join("document-analyser");
        if candidate.join(DEV_MARKER).exists() {
            return Some(candidate);
        }
    }
    None
}

fn spawn_child(spec: &SpawnSpec, token: &str) -> std::io::Result<Child> {
    let (program, args, cwd): (&PathBuf, Vec<String>, Option<&PathBuf>) = match spec {
        SpawnSpec::DevUvicorn { program, args, cwd } => (program, args.clone(), Some(cwd)),
        SpawnSpec::Sidecar { program } => (
            program,
            vec!["--host".into(), BACKEND_HOST.into(), "--port".into(), BACKEND_PORT.to_string()],
            None,
        ),
    };

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .env("DOCUMENT_ANALYSER_PORT", BACKEND_PORT.to_string())
        .env("DOCUMENT_ANALYSER_HOST", BACKEND_HOST)
        .env("DOCUMENT_ANALYSER_MODE", "desktop")
        .env("DOCUMENT_ANALYSER_AUTH_TOKEN", token)
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit()) // surface backend logs in the dev terminal
        .stderr(Stdio::inherit())
        .kill_on_drop(false);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    // Own process group so we can signal the whole tree (bootloader + server),
    // mirroring the Electron `detached` spawn. No-op on Windows.
    #[cfg(unix)]
    cmd.process_group(0);

    cmd.spawn()
}

// --- Process-group kill ----------------------------------------------------

fn kill_group_opt(pid: Option<u32>) {
    if let Some(pid) = pid {
        kill_group(pid);
    }
}

#[cfg(unix)]
fn kill_group(pid: u32) {
    // Negative pid = the process group. SIGTERM, then SIGKILL shortly after.
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    });
}

/// Blocking group kill for the signal-handler path, which exits immediately
/// after (so the delayed-SIGKILL thread wouldn't get to run). Escalate inline.
#[cfg(unix)]
fn kill_group_sync(pid: u32) {
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_millis(500));
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
}

#[cfg(windows)]
fn kill_group(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/pid", &pid.to_string(), "/T", "/F"])
        .spawn();
}

// --- Stale-port reclaim ----------------------------------------------------

async fn reclaim_stale_port() {
    // Nothing there? Nothing to reclaim.
    if http_get("/health", None).await.unwrap_or(0) != 200 {
        return;
    }
    // Only kill something that looks like a document-analyser (checked via the
    // unauthenticated /manifest) — never a stranger's process.
    let looks_like_ours = match http_get_body("/manifest").await {
        Ok((200, body)) => {
            let b = body.to_lowercase();
            b.contains("document") || b.contains("analyser") || b.contains("analyzer") || b.contains("lens")
        }
        _ => false,
    };
    if !looks_like_ours {
        println!("[backend] port {BACKEND_PORT} busy with an unknown service — leaving it alone");
        return;
    }
    println!("[backend] reclaiming stale backend on :{BACKEND_PORT}");
    kill_port_listeners();
    // Wait up to ~10s for the port to fall silent.
    for _ in 0..20 {
        if http_get("/health", None).await.unwrap_or(0) != 200 {
            return;
        }
        sleep(Duration::from_millis(500)).await;
    }
}

#[cfg(unix)]
fn kill_port_listeners() {
    let out = std::process::Command::new("lsof")
        .args(["-ti", &format!("tcp:{BACKEND_PORT}")])
        .output();
    if let Ok(out) = out {
        for pid in String::from_utf8_lossy(&out.stdout).split_whitespace() {
            if let Ok(pid) = pid.parse::<i32>() {
                unsafe {
                    libc::kill(pid, libc::SIGTERM);
                }
            }
        }
    }
}

#[cfg(windows)]
fn kill_port_listeners() {
    // Best-effort on Windows: find the PID via netstat and taskkill it.
    if let Ok(out) = std::process::Command::new("netstat").args(["-ano"]).output() {
        for line in String::from_utf8_lossy(&out.stdout).lines() {
            if line.contains(&format!(":{BACKEND_PORT}")) && line.to_uppercase().contains("LISTENING") {
                if let Some(pid) = line.split_whitespace().last() {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/pid", pid, "/T", "/F"])
                        .spawn();
                }
            }
        }
    }
}

// --- Minimal HTTP/1.1 client (loopback only — avoids a heavy dep) ----------

async fn http_get(path: &str, token: Option<&str>) -> Result<u16, String> {
    let (status, _) = http_request(path, token).await?;
    Ok(status)
}

async fn http_get_body(path: &str) -> Result<(u16, String), String> {
    http_request(path, None).await
}

async fn http_request(path: &str, token: Option<&str>) -> Result<(u16, String), String> {
    let fut = async {
        let mut stream = TcpStream::connect((BACKEND_HOST, BACKEND_PORT))
            .await
            .map_err(|e| e.to_string())?;
        let auth = token
            .map(|t| format!("Authorization: Bearer {t}\r\n"))
            .unwrap_or_default();
        let req = format!(
            "GET {path} HTTP/1.1\r\nHost: {BACKEND_HOST}\r\nConnection: close\r\n{auth}\r\n"
        );
        stream.write_all(req.as_bytes()).await.map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&buf);
        let status = text
            .split_whitespace()
            .nth(1)
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or_else(|| "malformed HTTP response".to_string())?;
        let body = text.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        Ok::<(u16, String), String>((status, body))
    };
    timeout(Duration::from_secs(5), fut)
        .await
        .map_err(|_| "request timeout".to_string())?
}

// --- Commands --------------------------------------------------------------

#[tauri::command]
pub fn backend_get_status(backend: State<'_, Backend>) -> BackendStatus {
    backend.status()
}

#[tauri::command]
pub fn backend_get_url() -> String {
    backend_url()
}

#[tauri::command]
pub fn backend_get_token(backend: State<'_, Backend>) -> String {
    backend.token()
}

#[tauri::command]
pub fn backend_restart(backend: State<'_, Backend>) -> Result<serde_json::Value, String> {
    backend.restart();
    Ok(serde_json::json!({ "success": true }))
}
