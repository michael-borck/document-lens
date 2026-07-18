/**
 * Tauri desktop bridge — the coexistence seam.
 *
 * The renderer talks to a `window.electron` *contract* (the `ElectronAPI` type
 * in src/types/electron.d.ts), never to Electron directly. Under Electron,
 * electron/preload.ts provides that object. Under Tauri there is no preload, so
 * this module builds an equivalent object backed by `@tauri-apps/api` and
 * assigns it to `window.electron`. A runtime check picks the right shell, so
 * the same renderer bundle runs under both while the migration is in flight.
 *
 * Phase 0: only `getVersion` is wired to a real Rust command (`app_get_version`)
 * to prove the IPC pipe. Every other method throws a clear NOT_IMPLEMENTED so
 * un-ported surface is obvious; event subscriptions return a no-op unsubscribe
 * so component cleanups don't crash before their producers are wired.
 */
import { invoke } from '@tauri-apps/api/core'
import type { ElectronAPI } from '@/types/electron'

/** True when running inside the Tauri shell (vs Electron or a plain browser). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function notImplementedError(method: string): Error {
  return new Error(
    `[tauri-bridge] window.electron.${method}() is not implemented yet. ` +
      `See TAURI-MIGRATION-PLAN.md.`,
  )
}

/** Methods wired to Rust so far. Grows one phase at a time. */
const implemented: Partial<ElectronAPI> = {
  // App
  getVersion: () => invoke<string>('app_get_version'),
  getPath: (name: string) => invoke<string>('app_get_path', { name }),

  // Database — keyed access (Phase 1). Mirrors electron/preload.ts; the Rust
  // side resolves the key against the generated registry (db_generated.rs).
  // Tauri maps camelCase JS arg keys (idColumn) to snake_case Rust params.
  dbSelect: <T = unknown>(key: string, params?: unknown[]) =>
    invoke<T[]>('db_select', { key, params }),
  dbRunKeyed: (key: string, params?: unknown[]) =>
    invoke('db_run', { key, params }),
  dbUpdate: (table: string, columns: string[], idColumn: string, params: unknown[]) =>
    invoke('db_update', { table, columns, idColumn, params }),
  dbSelectIn: <T = unknown>(key: string, ids: unknown[]) =>
    invoke<T[]>('db_select_in', { key, ids }),
  dbRunBatch: async (ops: { key: string; params?: unknown[] }[]) => {
    await invoke('db_run_batch', { ops })
    return { success: true }
  },

  // Dialogs (Phase 2) — the picked paths are recorded in the fs-guard allowlist
  // by the Rust side, which is what lets the fs_* reads/writes below succeed.
  openFileDialog: (options?: unknown) => invoke('dialog_open_file', { options }),
  openDirectoryDialog: (options?: unknown) => invoke('dialog_open_directory', { options }),
  openFolderDialog: (options?: unknown) => invoke('dialog_open_folder', { options }),
  saveFileDialog: (options?: unknown) => invoke('dialog_save_file', { options }),

  // Filesystem (Phase 2) — all guarded by fs-guard on the Rust side.
  readFile: (filePath: string) => invoke<ArrayBuffer>('fs_read_file', { path: filePath }),
  getFileStats: (filePath: string) =>
    invoke<{ size: number; mtime: number }>('fs_get_file_stats', { path: filePath }),
  computeFileHash: (filePath: string) =>
    invoke<string>('fs_compute_file_hash', { path: filePath }),
  writeFile: (filePath: string, data: ArrayBuffer | string) =>
    typeof data === 'string'
      ? invoke('fs_write_file', { path: filePath, text: data })
      : invoke('fs_write_file', { path: filePath, bytes: Array.from(new Uint8Array(data)) }),

  // Shell (Phase 2)
  openPath: (filePath: string) => invoke<string>('shell_open_path', { path: filePath }),
  openExternal: (url: string) => invoke('shell_open_external', { url }).then(() => undefined),
}

/**
 * Event-subscription methods must always return an unsubscribe fn, even while
 * stubbed, so `useEffect` cleanups stay valid. They simply never fire until
 * their producing command/event is wired in a later phase.
 */
const EVENT_METHODS = new Set<string>([
  'onBackendStatusChanged',
  'onUpdateAvailable',
  'onUpdateNotAvailable',
  'onUpdateDownloadProgress',
  'onUpdateDownloaded',
  'onUpdateError',
  'onHelpNavigate',
])

function buildBridge(): ElectronAPI {
  return new Proxy(implemented as ElectronAPI, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') return Reflect.get(target, prop, receiver)
      const own = (target as unknown as Record<string, unknown>)[prop]
      if (typeof own === 'function') return own
      if (EVENT_METHODS.has(prop)) {
        return () => {
          console.warn(`[tauri-bridge] ${prop} is not wired yet; no events will fire.`)
          return () => {}
        }
      }
      // All non-event ElectronAPI methods are async; reject (don't throw
      // synchronously) so callers' try/catch and .catch() behave normally and
      // an un-ported method degrades to a handled failure, not a white screen.
      return () => Promise.reject(notImplementedError(prop))
    },
  })
}

/** Fire-and-forget log to the Rust side, so it lands in the dev terminal. */
function logToTerminal(level: 'info' | 'error', message: string): void {
  void invoke('app_log', { level, message }).catch(() => {
    /* logging must never itself break the app */
  })
}

/**
 * Forward uncaught renderer errors to the terminal.
 *
 * Electron piped renderer console output to the terminal; a Tauri webview does
 * not — its console lives only in the webview inspector. During the migration
 * the dominant failure mode is a renderer throwing on a not-yet-ported
 * `window.electron` method, whose only visible symptom is a blank window. This
 * makes that cause legible without opening devtools.
 */
function installErrorForwarding(): void {
  window.addEventListener('error', (event) => {
    logToTerminal('error', `${event.message} @ ${event.filename}:${event.lineno}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const detail = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason)
    logToTerminal('error', `Unhandled rejection: ${detail}`)
  })
}

/**
 * Install the Tauri-backed `window.electron` when running under Tauri. No-op
 * under Electron (preload already provided it) or in a plain browser/tests.
 * Call once, before the React tree reads `window.electron`.
 */
export function installDesktopBridge(): void {
  if (!isTauri()) return
  ;(window as unknown as { electron: ElectronAPI }).electron = buildBridge()
  installErrorForwarding()
  console.info('[tauri-bridge] Tauri desktop bridge installed (Phase 0).')
  logToTerminal('info', 'desktop bridge installed (Phase 0) — renderer bundle is executing')
}
