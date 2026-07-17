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

function notImplemented(method: string): never {
  throw new Error(
    `[tauri-bridge] window.electron.${method}() is not implemented yet ` +
      `(Phase 0 scaffold). See TAURI-MIGRATION-PLAN.md.`,
  )
}

/** Methods wired to Rust so far. Grows one phase at a time. */
const implemented: Partial<ElectronAPI> = {
  getVersion: () => invoke<string>('app_get_version'),
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
      return () => notImplemented(prop)
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
