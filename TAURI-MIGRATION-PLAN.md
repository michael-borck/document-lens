# Document Lens — Electron → Tauri Migration Plan

Target: **Tauri 2.x** (current as of 2026). This plan converts the desktop
shell from Electron to Tauri while keeping the React/Vite renderer, the SQLite
data model, and the Python `document-analyser` backend intact.

> Scope note: "document-lens-desktop" is this repo (`document-lens/`) — the
> Electron desktop build. The renderer (`src/`) is a normal React SPA and does
> **not** change much; almost all the work is re-implementing the Electron
> **main process** (`electron/`) as a Tauri Rust core.

---

## 0. Motivation & bundle-size analysis (the deciding factor)

**Primary goal: shrink the download.** The current installer takes a long time
to fetch. Measured breakdown of the shipped `Document Lens Desktop.app`
(v0.9.0, arm64), installed:

| Component | Size | Share |
|---|---|---|
| **Electron Framework** (Chromium + Node) | **232 MB** | **75%** |
| `Contents/Resources` (renderer, `better-sqlite3`, PDF, bundled backend) | 76 MB | 25% |
| **Total installed** | **309 MB** | (compresses to ~110 MB DMG) |

**This validates the migration.** The 232 MB Tauri eliminates outright — it uses
the OS's system WebView (WKWebView / WebView2 / WebKitGTK, shipped by the OS, 0
bytes in our bundle) instead of bundling Chromium, and a Rust core of a few MB
instead of Node. Projected result:

- Installed app: **~309 MB → ~40–70 MB** (renderer dist + small Rust binary +
  backend sidecar; `better-sqlite3` also drops out, moving to Rust).
- Download (DMG/NSIS): **~110 MB → ~25–45 MB**. Roughly a **2–4× reduction.**

**The one caveat — the Python backend is the component Tauri does _not_ shrink.**
`document-analyser`'s dependency tree includes `torch` (7 GB installed),
`transformers`, `spacy`, `scipy`, `pandas`, `sklearn`. The *current* shipped
build is small (the whole Resources dir is 76 MB, so the packaged backend
clearly excludes the heavy ML stack today), but **if a future build bundles
those, no shell choice matters** — a torch-bearing PyInstaller binary dwarfs
Chromium. Keep the desktop backend's deps lean (lazy-download models, or
server-side inference) as a separate, ongoing lever independent of this port.

**Action:** confirm the packaged backend size for the version you'll ship on
Tauri; that plus the ~15–20 MB renderer dist is your new floor.

---

## 1. Why this is a real port, not a reskin

The renderer is portable. The value — and the risk — is entirely in the
`electron/` main process, which is ~2,900 lines of native integration:

| File | Lines | What it does | Portability |
|---|---|---|---|
| `main.ts` | 804 | Window, IPC handlers, dialogs, shell, updater, DB handlers, fs handlers | Rewrite in Rust |
| `backend-manager.ts` | 591 | Spawn/health/restart the Python backend; port reclaim; process-group kill | Rewrite in Rust (hardest) |
| `queries.ts` | 442 | Keyed SQL registry + `buildUpdate` allowlist (security boundary) | Port SQL verbatim to Rust |
| `schema.ts` | 340 | SQLite DDL + `SCHEMA_VERSION` | Reuse DDL as-is |
| `ai-providers.ts` | 329 | BYOK providers, keychain-encrypted keys, LLM HTTP calls | Rewrite in Rust |
| `preload.ts` | 240 | `window.electron` contract exposed to renderer | Replace with a TS shim over Tauri `invoke` |
| `menu.ts` | 233 | Native app menu (Help topics, Check for Updates) | Rewrite via Tauri menu API |
| `database.ts` | 154 | DB lifecycle: path, wipe-on-schema-bump, seed reference data | Rewrite in Rust |
| `fs-guard.ts` | 78 | Path allowlist for `fs:*` (the filesystem security boundary) | Rewrite in Rust |

Renderer coupling is small and already well-seamed:
- **23 files** reference `window.electron`.
- DB access is funneled through `src/services/db.ts`'s `DbDriver` seam — only
  the `ipcDriver` implementation needs swapping; the ~100 `selectAll`/`runStatement`
  callsites don't change.
- Backend HTTP access is funneled through `src/config/backend.ts`
  (`getBackendUrl` / `getBackendToken`).

**No sibling app in the monorepo is on Tauri yet** — every `*-desktop` app is
Electron. This is the first, so there's no house pattern to copy; treat the
result as the reference implementation for the others.

---

## 2. Target architecture

```
┌─────────────────────────────────────────────┐
│ Renderer (unchanged): React + Vite + Zustand │
│   window.electron shim → @tauri-apps/api      │
└───────────────┬─────────────────────────────┘
                │ invoke() / listen()
┌───────────────▼─────────────────────────────┐
│ Tauri core (Rust, src-tauri/)                │
│  • commands: db_*, fs_*, dialog_*, ai_*, ... │
│  • SQLite via rusqlite (keyed registry)      │
│  • keychain via `keyring` crate              │
│  • backend supervisor (sidecar + health)     │
│  • plugins: dialog, shell/opener, updater,   │
│    single-instance, process (sidecar)        │
└───────────────┬─────────────────────────────┘
                │ spawns
┌───────────────▼─────────────────────────────┐
│ Python backend (document-analyser)           │
│  PyInstaller binary as a Tauri **sidecar**   │
└─────────────────────────────────────────────┘
```

Key mechanical translations:
- `ipcMain.handle('x', fn)` → `#[tauri::command] fn x(...)` registered in
  `invoke_handler`.
- `ipcRenderer.invoke('x', a)` → `invoke('x', { a })`.
- `webContents.send('evt', p)` → `app.emit('evt', p)` / `window.emit`; renderer
  `ipcRenderer.on` → `listen('evt', cb)`.

---

## 3. Decisions (resolved)

1. **Query Registry / tests — GENERATE from TS.** ✅ Keep `queries.ts` +
   `schema.ts` as the TS source of truth (renderer vitest keeps its in-memory
   `better-sqlite3` adapter unchanged) and **generate** the Rust registry from
   them via a checked-in codegen step, so the two can't drift.

2. **AI/BYOK — FOLD INTO THE PYTHON BACKEND.** ✅ Move BYOK provider config,
   key storage, and the chat/testConnection/listModels calls out of the desktop
   shell into `document-analyser` as FastAPI endpoints. Consequences:
   - The Rust core needs **no** `keyring`/LLM `reqwest` — AI leaves the shell
     entirely. Simplifies the port.
   - The renderer's `ai*` calls go over HTTP to the backend (reusing the
     per-launch auth token in `src/config/backend.ts`) instead of
     `window.electron.ai*`. Keep the same method names on the shim, backed by
     `fetch`, so consumers (`Settings.tsx`, `ai-observations.ts`) barely change.
   - **New backend work:** `document-analyser` today has *no* LLM provider code
     — only AI-*detection* (`integrity_checker.py`, `ai_patterns.json`). So this
     is a net-new port of `ai-providers.ts` (~330 lines) into Python
     (`httpx` + Python `keyring`), not a move of existing code. Small and
     self-contained, as you noted.
   - **Tradeoff accepted:** AI now requires the backend to be up (today it works
     in offline mode because it lives in Electron main). Fine per your call.

3. **Python backend stays a spawned sidecar.** ✅ Repackage the PyInstaller
   binary as a Tauri sidecar (`externalBin`). Supervisor logic (auth token,
   health probe, port reclaim, restart backoff) ports to Rust. Now also hosts
   the AI endpoints (decision 2).

4. **Auto-update — adopt `tauri-plugin-updater`.** Tauri's updater is *not*
   electron-updater: signed static `latest.json` + an Ed25519 key pair, not
   `latest-mac.yml` + GitHub release detection. Generate signing keys, sign
   artifacts, publish artifact + `latest.json` to the same GitHub releases.
   Replaces the `electron-updater` flow wholesale. **Required — see decision 5.**

5. **FULL PARITY.** ✅ The end state must match Electron feature-for-feature,
   including signed installers, macOS notarization, and working auto-update.
   Phasing below still builds the core first and adds signing/updater last —
   that's sequencing to de-risk, *not* dropping scope. Nothing ships until
   Phase 6 lands.

---

## 4. Component-by-component mapping

| Electron | Tauri replacement |
|---|---|
| `BrowserWindow` config, `hiddenInset` titlebar, min size, `ready-to-show` | `tauri.conf.json` window config; `titleBarStyle: "Overlay"` on macOS |
| `requestSingleInstanceLock` | `tauri-plugin-single-instance` |
| `dialog.showOpenDialog/showSaveDialog` | `tauri-plugin-dialog` |
| `dialog:openFolder` recursive walk (`walkForImportableFiles`, 5000 cap, symlink-loop guard, dotfile skip) | Custom Rust command (`walkdir` crate) |
| `shell.openExternal` (web/mail; guarded `file://#page=N`) | `tauri-plugin-opener` + guard in Rust |
| `shell.openPath` (guarded) | `tauri-plugin-opener` + `assert_readable` |
| `fs:readFile/writeFile/getFileStats/computeFileHash` | Custom Rust commands (`std::fs`, `sha2`) behind the ported fs-guard |
| `fs-guard.ts` allowlist (session dialog paths + registered-doc predicate + userData subtree) | Rust `Mutex<FsGuardState>` in Tauri managed state |
| `better-sqlite3` + `queries.ts` + `buildUpdate` | `rusqlite` + ported keyed registry + column allowlist |
| `database.ts` (WAL, FK pragma, wipe-on-version-bump, seed) | Rust DB init module |
| `safeStorage` key encryption | `keyring` crate (macOS Keychain / Win Credential Manager / libsecret) |
| `ai-providers.ts` HTTP (anthropic/openai/gemini shapes) | Rust `reqwest` |
| `backend-manager.ts` spawn | Tauri sidecar (`tauri-plugin-shell` `Command::new_sidecar`) |
| backend health probe + auth token (`crypto.randomBytes`) | Rust `reqwest` + `rand`; token in managed state |
| stale-port reclaim (`lsof`/`netstat`/`taskkill`) | Rust (`sysinfo` crate, or keep `lsof`/`netstat` via `std::process::Command`) |
| process-group kill (`process.kill(-pid)`) | Rust (spawn in new process group; `nix::sys::signal` on Unix, `taskkill /T /F` on Windows) |
| `electron-updater` | `tauri-plugin-updater` (see §3.4) |
| `Menu.setApplicationMenu` + Help nav events | Tauri `MenuBuilder` in `setup`; emit `help:navigate` |
| `app.getVersion` / `app.getPath` (allowlisted) | `tauri::path` + `app.package_info().version` |
| `preload.ts` `window.electron` object | `src/lib/desktop.ts` shim implementing the same `ElectronAPI` interface over `invoke`/`listen`, assigned to `window.electron` |

---

## 5. Phased plan

### Phase 0 — Spike & scaffold (0.5 wk)
- `npm create tauri-app` style scaffold *inside* the repo (`src-tauri/`),
  wired to the existing Vite build (`beforeDevCommand`/`frontendDist`).
- Get the current renderer rendering in a Tauri window with a **stub**
  `window.electron` shim (every method throws "not implemented yet").
- Decide the crates: `rusqlite`, `reqwest`, `keyring`, `sha2`, `walkdir`,
  `sysinfo`/`nix`, `rand`, `serde`.
- **Exit:** app boots, shows UI, no native features yet.

### Phase 1 — Database core (1–1.5 wk) — *biggest single chunk*
- Reuse `schema.ts` DDL verbatim; port `SCHEMA_VERSION` handling (wipe-on-bump),
  WAL + FK pragmas, reference-data seeding (`DEFAULT_COUNTRIES`/`INDUSTRIES`).
- Port the keyed registry + `buildUpdate` allowlist per §3.1 (codegen from
  `queries.ts`).
- Implement commands: `db_select`, `db_run`, `db_update`, `db_select_in`,
  `db_run_batch` (one `rusqlite` transaction, matching the atomic-batch
  semantics). Return `{ changes, lastInsertRowid }`.
- Swap `src/services/db.ts` `ipcDriver` to call `invoke`.
- **Exit:** Projects/Library/Keywords pages read & write; renderer vitest suite
  still green.

### Phase 2 — Filesystem, dialogs, shell (1 wk)
- Port `fs-guard` into Rust managed state (dialog files/dirs sets + userData
  subtree + `is_registered_document` DB predicate).
- Commands: `fs_read_file` (return bytes — see §7 binary note), `fs_write_file`,
  `fs_get_file_stats`, `fs_compute_file_hash`.
- Dialog commands via `tauri-plugin-dialog`; port `openFolder` recursive walk.
- Shell open/openExternal with the web-scheme + guarded-`file://` checks.
- **Exit:** import documents, open a PDF at a page, export a bundle.

### Phase 3 — AI providers / BYOK (1 wk)
- Port config JSON store (`ai-providers.json` in appdata).
- Encrypt keys via `keyring`; expose `encryptionAvailable` for the UI warning.
- Commands: `ai_get_providers`, `ai_save_provider`, `ai_set_active_provider`,
  `ai_reveal_key`, `ai_test_connection`, `ai_list_models`, `ai_chat` — port the
  three API shapes (anthropic/openai/gemini).
- **Exit:** Settings → AI provider round-trips; `ai_chat` powers observations.

### Phase 4 — Python backend supervisor (1.5–2 wk) — *hardest*
- Repackage `document-analyser` PyInstaller output as a Tauri sidecar
  (`externalBin`, per-target-triple naming).
- Rust supervisor: generate per-launch auth token; spawn sidecar with the
  `DOCUMENT_ANALYSER_*` env; `waitForReady` via `/health` + authed probe;
  5s health poll; phase lifecycle → emit `backend:status-changed`.
- Port stale-port reclaim and process-group kill (the orphaned-uvicorn defense).
- Commands: `backend_get_status/url/token/restart`.
- Dev mode: spawn uvicorn from sibling `../document-analyser` (mirror
  `findDevBackendRepo`).
- **Exit:** analysis runs; backend chip shows ready; clean shutdown leaves no
  orphan on :8765.

### Phase 5 — Menu, window UX, app info, events (0.5 wk)
- Tauri menu (Help topics → `help:navigate`, Check for Updates, User Manual).
- `app_get_version`, `app_get_path` (keep the allowlist).
- Wire remaining renderer event subscriptions (`onBackendStatusChanged`,
  `onHelpNavigate`).
- **Exit:** feature parity minus updater.

### Phase 6 — Packaging, signing, auto-update (1–1.5 wk)
- `tauri.conf.json` bundle targets (dmg/nsis/AppImage); bundle the User Manual
  PDF + backend sidecar as resources/externalBin.
- macOS: hardened runtime, entitlements, codesign + **notarize** (reuse the
  Apple creds/flow from `scripts/notarize.js`).
- `tauri-plugin-updater`: generate keypair, sign artifacts, publish
  `latest.json` to GitHub releases; port the updater UI events
  (`update-available`/`download-progress`/`downloaded`/`error`).
- **Exit:** signed installers on 3 OSes; end-to-end self-update works.

### Phase 7 — Test & CI migration (0.5–1 wk, overlaps)
- Renderer vitest: unchanged if §3.1 recommendation is taken.
- E2E: Playwright-against-Electron → `tauri-driver` + WebDriver (or rebuild
  `e2e/smoke.spec.ts` on the Tauri harness).
- CI: replace `electron-builder` jobs with `tauri build` (adds a Rust toolchain
  + per-OS runners).

---

## 6. Renderer changes (small, but touch 23 files)

Write **one** shim, `src/lib/desktop.ts`, that implements the exact
`ElectronAPI` interface from `preload.ts` over `@tauri-apps/api`
(`invoke`, `event.listen`) and assigns it to `window.electron`. Then the 23
consumers compile unchanged. Notable adapters:
- Event subscriptions (`onBackendStatusChanged`, `onUpdate*`, `onHelpNavigate`)
  must return an unsubscribe fn — wrap Tauri's `listen` unlisten promise.
- `readFile` returns `ArrayBuffer` today — see §7.

Consider renaming `window.electron` → `window.desktop` as a follow-up, but
keeping the name for the port minimizes diff and risk.

---

## 7. Gotchas & risks

- **Binary over IPC.** `fs:readFile` returns an `ArrayBuffer`. Tauri commands
  return JSON; return `Vec<u8>` (Tauri v2 serializes to a number array — costly
  for large PDFs) or, better, expose bytes via a custom protocol / the
  `tauri-plugin-fs` streaming path. Validate PDF-viewer performance early.
- **Process-group kill parity.** The current code's orphaned-uvicorn defense
  (detached process group + `kill(-pid)` + `lsof`-based port reclaim) is
  subtle and battle-tested; budget real time to reproduce it in Rust and test
  the crash/force-quit paths.
- **Keychain differences.** `safeStorage` vs the `keyring` crate differ on
  Linux (libsecret/keyring may be absent); preserve the
  `encryptionAvailable=false` → plaintext-with-warning fallback.
- **Updater is a different model.** Not a drop-in; requires key management and
  a new release artifact layout. Don't discover this in Phase 6 — read the
  Tauri updater docs during Phase 0.
- **Sidecar naming.** Tauri requires target-triple-suffixed sidecar binaries
  (`document-lens-api-aarch64-apple-darwin`); the PyInstaller CI must emit
  per-arch names.
- **`sandbox: false`** was needed for `better-sqlite3`; irrelevant under Tauri
  (DB is in Rust), a small simplification.
- **Security model must be preserved verbatim:** keyed-query registry (no raw
  SQL over IPC), fs-guard allowlist, web-scheme-only external open, per-launch
  backend token. These are documented invariants in `CONTEXT.md`/ADRs — port
  them 1:1, don't "simplify."

---

## 8. Rough effort

~7–9 focused weeks for one engineer comfortable with Rust; add ramp-up if not.
Phases 1 and 4 dominate. Phases 1–5 (a runnable, unsigned parity build) are
~5–6 weeks; 6–7 (signing/update/CI) the rest. Much of Phase 7 overlaps.

---

## 9. Decisions — all resolved

1. Query registry: **generate Rust from `queries.ts`**, keep TS tests. ✅
2. AI/BYOK: **fold into the Python backend**. ✅
3. Backend: **stays a spawned sidecar**, now also hosting AI. ✅
4. Updater: **`tauri-plugin-updater`** (signed `latest.json`). ✅
5. Scope: **full parity** — signed, notarized, auto-updating. ✅
6. Motivation: **download size**. Measured & validated (§0): 75% of the app is
   the Chromium/Node shell Tauri removes; ~2–4× smaller download expected.

---

## 10. Migration strategy — incremental coexistence, not a long branch

`document-lens` ships releases every few days (0.28 → 0.29 in the recent log,
ADRs landing on `main`). A single long-lived "branch until parity" held for
7–9 weeks would rot against that cadence — constant rebasing, and you couldn't
ship Electron fixes without double-applying. **So: trunk-based incremental
coexistence.** Electron and Tauri share the renderer and live in the repo side
by side; Electron keeps shipping the whole time; Tauri grows in parallel until
it passes a parity gate; one small PR flips the default.

### Why coexistence is possible
The renderer targets a **contract**, `window.electron` (the `ElectronAPI`
type in `src/types/electron.d.ts`), not Electron directly:
- Under Electron, `electron/preload.ts` provides it.
- Under Tauri, a bootstrap (`src/lib/desktop-bridge.ts`) provides the **same
  interface** over `@tauri-apps/api` `invoke()`/`listen()`.
- A runtime check (`'__TAURI_INTERNALS__' in window`) picks the bridge at load.

So both shells drive the identical renderer. `electron/` and `src-tauri/`
coexist; `vite.config.ts` includes the Electron plugin only when **not** under
Tauri (`process.env.TAURI_ENV_PLATFORM` is set by the Tauri CLI for its
before-commands).

### Working rules
- Each plan phase = a **short-lived PR to `main`**, not a divergent branch.
- **CI builds *both* shells on every PR** — the guardrail that keeps a Tauri
  phase from silently breaking Electron and vice versa.
- **Land the AI-fold first**: it's shell-agnostic (renderer → backend HTTP),
  improves Electron too, and de-risks.
- **DB codegen** (`queries.ts` → Rust) runs in CI so the registries can't drift.
- `dev`/`build` stay Electron; add parallel `dev:tauri`/`build:tauri`.
- Optionally develop heavier Rust phases in a **git worktree** off `main` so
  the Electron dev environment stays untouched.

### The flip (parity gate → one PR)
Cut over only when **all** hold:
- [ ] Feature-parity checklist green (every `window.electron` method backed by a
      Tauri command; every emitted event wired).
- [ ] `tauri-driver` e2e suite passing (port of `e2e/smoke.spec.ts`).
- [ ] Signed + notarized installers building on macOS/Windows/Linux.
- [ ] Auto-update verified end-to-end against a real `latest.json`.

Then one small PR: swap default scripts to Tauri, remove `electron/`, update the
release workflow. Small because everything already worked behind the alt
scripts. Ship it as a version bump (e.g. **1.0**).

A long branch is only right if you **freeze** feature work during the migration
— which the release cadence says you won't.

---

## 10a. Environment prerequisite — the repo lives on exFAT ⚠️

`/Volumes/Crucial X9` is an **exFAT** volume. exFAT can't store extended
attributes, so macOS writes an AppleDouble `._<name>` sidecar next to every
file (there are already **327** in this repo, excluding `node_modules` —
`._package.json`, `._vite.config.ts`, …). This **breaks the Tauri build**:

```
failed to define permissions for core:path: failed to read file
'…/out/permissions/path/autogenerated/._default.toml':
stream did not contain valid UTF-8
```

Tauri's `build.rs` globs its generated permission directory and tries to parse
the `._*` sidecars as TOML. Electron never hit this because it doesn't
generate/re-read files that way.

**Fix — keep Cargo's `target/` off exFAT.** Add to your shell profile:

```sh
export CARGO_TARGET_DIR="$HOME/.cache/cargo-target"   # on the internal APFS disk
```

This is worth doing regardless of the bug: Rust generates *hundreds of
thousands* of small files in `target/`, and exFAT is markedly slower at that
than APFS — expect meaningfully faster builds too. A machine-specific absolute
path can't be committed to `.cargo/config.toml`, so this stays an env var
(or move the repo to the internal disk).

CI is unaffected (Linux/macOS runners use native filesystems).

Housekeeping: `dot_clean -m .` sweeps existing `._*` files; they regenerate on
exFAT, so treat it as maintenance rather than a cure.

---

## 11. Phase 0 — what was scaffolded

First commit of the coexistence setup (this branch):
- `src-tauri/` — minimal Tauri 2 Rust core: one real command (`app_get_version`)
  to prove the IPC pipe; window config mirroring Electron (1400×900, min
  1024×768, macOS overlay titlebar); `com.documentlens.app` identifier.
- `src/lib/desktop-bridge.ts` — runtime-detected shim assigning a Tauri-backed
  `ElectronAPI` to `window.electron`; every not-yet-ported method throws a
  clear `NOT_IMPLEMENTED` so gaps are obvious. Imported at the top of
  `src/main.tsx` (before the app reads `window.electron`).
- `vite.config.ts` — Electron plugin gated behind `!process.env.TAURI_ENV_PLATFORM`.
- `package.json` — `dev:tauri` / `build:tauri` scripts; `@tauri-apps/api` +
  `@tauri-apps/cli`.
- Electron path untouched: `npm run dev` / `npm run build` still build Electron.

Run the Tauri shell: `npm run dev:tauri` (first Rust build takes a few minutes).
