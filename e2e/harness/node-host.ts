/**
 * Node-side "main-process double" for the browser e2e harness.
 *
 * The Tauri port left no Electron main process for Playwright to drive, so
 * the suite runs the real renderer in plain Chromium (vite preview) and
 * answers its `window.electron` calls from here — the same split the
 * production shell has, with this module standing in for the Rust side:
 *
 *   - db* methods dispatch against the REAL Query Registry
 *     (src/db/queries.ts) over a REAL schema-built SQLite database
 *     (src/db/schema.ts, via node:sqlite :memory:). The Rust shell runs the
 *     generated twin of that registry (db_generated.rs, drift-checked in
 *     CI), so renderer ↔ registry ↔ schema agreement is genuinely tested.
 *   - fs_* methods hit the real filesystem (readFile/getFileStats/
 *     computeFileHash) so import flows work on real sample PDFs.
 *   - dialog_* methods return test-stubbed results (see mockOpenFileDialog).
 *   - backend_* supervises a real document-analyser uvicorn from the sibling
 *     checkout, exactly like the Rust dev-mode spawn (same program
 *     resolution, args, env — see src-tauri/src/backend.rs resolve_spawn /
 *     spawn_child), including the per-launch DOCUMENT_ANALYSER_AUTH_TOKEN.
 *     When the sibling checkout is missing or never becomes ready, status
 *     reports 'unreachable' and backend-gated specs skip themselves.
 *
 * The page side of this bridge lives in page-bridge.ts; Playwright's
 * exposeFunction is the transport, so every value crossing the boundary is
 * JSON-safe (bytes travel as number[], mirroring the Tauri bridge).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA } from '../../src/db/schema'
import { buildUpdate, getInQuery, getQuery } from '../../src/db/queries'
import type {
  BackendStatus,
  OpenDialogResult,
  OpenFolderResult,
  SaveDialogResult,
} from '../../src/types/electron'

const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = 8765
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`
const DEV_MARKER = path.join('document_analyser', 'api', '__init__.py')
const READY_TIMEOUT_MS = 150_000

const PKG_VERSION = (
  JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    version: string
  }
).version

/** Values node:sqlite accepts for positional `?` binds. */
type Bindable = null | number | bigint | string | Uint8Array

function bind(params?: unknown[]): Bindable[] {
  // undefined can't cross the JSON boundary; normalise defensively because
  // node:sqlite rejects it outright.
  return (params ?? []).map((p) => (p === undefined ? null : p)) as Bindable[]
}

/** Make a value survive JSON serialisation (BigInt → number, recursively). */
function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)]),
    )
  }
  return value
}

/** Walk up from cwd looking for an ancestor with a document-analyser sibling
 *  (mirrors find_dev_repo in src-tauri/src/backend.rs). */
function findBackendRepo(): string | null {
  let dir = process.cwd()
  for (;;) {
    const candidate = path.join(dir, 'document-analyser')
    if (existsSync(path.join(candidate, DEV_MARKER))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

async function healthAnswers200(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`)
    return res.status === 200
  } catch {
    return false
  }
}

/** "Ready" means OUR backend: /health is unauthenticated, so a stale server
 *  could answer 200 — the authed probe must not 401/403 (mirrors
 *  verified_health in backend.rs). */
async function verifiedReady(token: string): Promise<boolean> {
  if (!(await healthAnswers200())) return false
  try {
    const res = await fetch(`${BACKEND_URL}/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.status !== 401 && res.status !== 403
  } catch {
    return false
  }
}

export class NodeHost {
  private db: DatabaseSync
  private scratchDir: string
  private backend: { child: ChildProcess; token: string; pid?: number } | null = null
  private backendAttempted = false

  // Dialog stubs — tests set these before clicking whatever opens the dialog.
  private openFileResult: OpenDialogResult = { canceled: true, filePaths: [] }
  private openDirResult: OpenDialogResult = { canceled: true, filePaths: [] }
  private openFolderResult: OpenFolderResult = {
    canceled: true,
    filePaths: [],
    folderCount: 0,
    truncated: false,
  }
  private saveFileResult: SaveDialogResult = { canceled: true }

  constructor() {
    this.scratchDir = mkdtempSync(path.join(tmpdir(), 'doclens-e2e-'))
    this.db = new DatabaseSync(':memory:')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(SCHEMA)
  }

  // ── test-facing controls ────────────────────────────────────────────────

  /** Every openFileDialog call returns these paths (same semantics as the
   *  old Electron dialog mock: one stubbed response for the whole test). */
  mockOpenFileDialog(paths: string[]): void {
    this.openFileResult = { canceled: false, filePaths: paths }
  }

  mockSaveFileDialog(filePath: string): void {
    this.saveFileResult = { canceled: false, filePath }
  }

  /**
   * Spawn the real analysis backend from the sibling document-analyser
   * checkout and wait until it verifiably answers as ours. Returns false —
   * callers test.skip() — when the checkout is missing, the port is already
   * owned by a backend we can't authenticate to, or readiness timed out.
   */
  async ensureBackend(): Promise<boolean> {
    if (this.backend) return true
    if (this.backendAttempted) return false
    this.backendAttempted = true

    const repo = findBackendRepo()
    if (!repo) {
      console.log('[e2e host] no sibling document-analyser checkout — backend specs will skip')
      return false
    }
    if (await healthAnswers200()) {
      console.log(
        `[e2e host] :${BACKEND_PORT} already serves a backend we didn't spawn ` +
          '(is the dev app running?) — backend specs will skip',
      )
      return false
    }

    const token = randomBytes(24).toString('hex')
    const venv = path.join(repo, '.venv', 'bin', 'python')
    const venvWin = path.join(repo, '.venv', 'Scripts', 'python.exe')
    let program: string
    let args: string[]
    if (existsSync(venv)) {
      program = venv
      args = []
    } else if (existsSync(venvWin)) {
      program = venvWin
      args = []
    } else {
      program = 'uv'
      args = ['run']
    }
    args.push(
      '-m', 'uvicorn', 'document_analyser.api:app',
      '--host', BACKEND_HOST,
      '--port', String(BACKEND_PORT),
    )

    const child = spawn(program, args, {
      cwd: repo,
      env: {
        ...process.env,
        DOCUMENT_ANALYSER_PORT: String(BACKEND_PORT),
        DOCUMENT_ANALYSER_HOST: BACKEND_HOST,
        DOCUMENT_ANALYSER_ALLOWED_ORIGINS:
          'tauri://localhost,https://tauri.localhost,http://tauri.localhost,http://localhost:5173,http://localhost:3000',
        DOCUMENT_ANALYSER_AUTH_TOKEN: token,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: process.platform !== 'win32',
    })
    this.backend = { child, token, pid: child.pid }

    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        console.log(`[e2e host] backend exited during startup (code ${child.exitCode})`)
        return false
      }
      if (await verifiedReady(token)) return true
      await new Promise((r) => setTimeout(r, 2000))
    }
    console.log('[e2e host] backend never became ready — backend specs will skip')
    return false
  }

  async close(): Promise<void> {
    if (this.backend) {
      const { child, pid } = this.backend
      this.backend = null
      try {
        // Own process group (detached spawn) — kill the tree, not just uvicorn.
        if (process.platform !== 'win32' && pid) process.kill(-pid, 'SIGTERM')
        else child.kill('SIGTERM')
      } catch {
        child.kill('SIGKILL')
      }
    }
    try {
      this.db.close()
    } catch {
      /* already closed */
    }
    rmSync(this.scratchDir, { recursive: true, force: true })
  }

  // ── page-facing dispatch (the window.electron contract) ─────────────────

  /** Entry point the fixture wires to page.exposeFunction. */
  async dispatch(method: string, args: unknown[]): Promise<unknown> {
    const handler = (this.handlers as Record<string, (...a: never[]) => unknown>)[method]
    if (!handler) throw new Error(`[e2e host] no handler for window.electron.${method}`)
    return jsonSafe(await handler(...(args as never[])))
  }

  private backendStatus(): BackendStatus {
    if (this.backend) {
      return {
        phase: 'ready',
        running: true,
        url: BACKEND_URL,
        pid: this.backend.pid,
        mode: 'dev-auto',
      }
    }
    return {
      phase: this.backendAttempted ? 'unreachable' : 'not-started',
      running: false,
      url: null,
      mode: 'dev-auto',
    }
  }

  private handlers = {
    // Database — real registry SQL against the real schema.
    dbSelect: (key: string, params?: unknown[]) =>
      this.db.prepare(getQuery(key)).all(...bind(params)),
    dbRunKeyed: (key: string, params?: unknown[]) => {
      const r = this.db.prepare(getQuery(key)).run(...bind(params))
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
    },
    dbUpdate: (table: string, columns: string[], idColumn: string, params: unknown[]) => {
      const r = this.db.prepare(buildUpdate(table, columns, idColumn)).run(...bind(params))
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
    },
    dbSelectIn: (key: string, ids: unknown[]) =>
      this.db.prepare(getInQuery(key, ids.length)).all(...bind(ids)),
    dbRunBatch: (ops: { key: string; params?: unknown[] }[]) => {
      this.db.exec('BEGIN')
      try {
        for (const op of ops) this.db.prepare(getQuery(op.key)).run(...bind(op.params))
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
      return { success: true }
    },

    // Dialogs — stubbed per test.
    openFileDialog: () => this.openFileResult,
    openDirectoryDialog: () => this.openDirResult,
    openFolderDialog: () => this.openFolderResult,
    saveFileDialog: () => this.saveFileResult,

    // Filesystem — real reads/writes (import works on real sample files).
    readFile: (filePath: string) => Array.from(readFileSync(filePath)),
    getFileStats: (filePath: string) => {
      const s = statSync(filePath)
      return { size: s.size, mtime: s.mtimeMs }
    },
    computeFileHash: (filePath: string) =>
      createHash('sha256').update(readFileSync(filePath)).digest('hex'),
    writeFile: (filePath: string, data: string | number[]) => {
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, typeof data === 'string' ? data : Buffer.from(data))
      return { success: true }
    },

    // Shell — no-ops in a headless run.
    openPath: () => '',
    openExternal: () => undefined,

    // App
    getVersion: () => PKG_VERSION,
    getPath: (name: string) => {
      const dir = path.join(this.scratchDir, name)
      mkdirSync(dir, { recursive: true })
      return dir
    },

    // Backend supervisor
    getBackendStatus: () => this.backendStatus(),
    getBackendUrl: () => BACKEND_URL,
    getBackendToken: () => this.backend?.token ?? '',
    restartBackend: async () => ({ success: await this.ensureBackend() }),

    // Updater — inert in tests.
    checkForUpdates: () => ({ updateAvailable: false }),
    downloadUpdate: () => ({ success: true }),
    installUpdate: () => undefined,
  }
}
