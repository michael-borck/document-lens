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

/**
 * Install the Tauri-backed `window.electron` when running under Tauri. No-op
 * under Electron (preload already provided it) or in a plain browser/tests.
 * Call once, before the React tree reads `window.electron`.
 */
export function installDesktopBridge(): void {
  if (!isTauri()) return
  ;(window as unknown as { electron: ElectronAPI }).electron = buildBridge()
  console.info('[tauri-bridge] Tauri desktop bridge installed (Phase 0).')
}
