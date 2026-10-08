/**
 * Page-side half of the e2e bridge. Installed via context.addInitScript()
 * BEFORE any app script runs — main.tsx's installDesktopBridge() no-ops
 * outside Tauri, so this mock owns window.electron for the whole session.
 *
 * Every method RPCs to the Node host through window.__e2eDispatch (wired by
 * the fixture via Playwright's exposeFunction). Bytes cross as number[]
 * (JSON-safe), mirroring the real Tauri bridge's fs_write_file encoding.
 *
 * This function is serialised into the page — it must stay self-contained
 * (no imports, no closures over Node state).
 */
export function installE2eBridge(): void {
  type Json = unknown
  const dispatch = (method: string, args: Json[]): Promise<Json> =>
    (
      window as unknown as { __e2eDispatch: (m: string, a: Json[]) => Promise<Json> }
    ).__e2eDispatch(method, args)

  // Backend-status event fan-out. The production bridge pushes Tauri events;
  // here a lightweight poller diffs getBackendStatus and notifies subscribers
  // (only while at least one subscription is live).
  const statusListeners = new Set<(s: Json) => void>()
  let lastStatusJson = ''
  let pollerStarted = false
  const ensurePoller = () => {
    if (pollerStarted) return
    pollerStarted = true
    window.setInterval(() => {
      if (statusListeners.size === 0) return
      dispatch('getBackendStatus', [])
        .then((s) => {
          const j = JSON.stringify(s)
          if (j !== lastStatusJson) {
            lastStatusJson = j
            statusListeners.forEach((cb) => cb(s))
          }
        })
        .catch(() => {
          /* page tearing down */
        })
    }, 1500)
  }

  const bridge = {
    // Database — keyed access (SQL resolved Node-side against the registry).
    dbSelect: (key: string, params?: Json[]) => dispatch('dbSelect', [key, params]),
    dbRunKeyed: (key: string, params?: Json[]) => dispatch('dbRunKeyed', [key, params]),
    dbUpdate: (table: string, columns: string[], idColumn: string, params: Json[]) =>
      dispatch('dbUpdate', [table, columns, idColumn, params]),
    dbSelectIn: (key: string, ids: Json[]) => dispatch('dbSelectIn', [key, ids]),
    dbRunBatch: (ops: { key: string; params?: Json[] }[]) => dispatch('dbRunBatch', [ops]),

    // Dialogs — the Node host returns whatever the current test stubbed.
    openFileDialog: (options?: Json) => dispatch('openFileDialog', [options]),
    openDirectoryDialog: (options?: Json) => dispatch('openDirectoryDialog', [options]),
    openFolderDialog: (options?: Json) => dispatch('openFolderDialog', [options]),
    saveFileDialog: (options?: Json) => dispatch('saveFileDialog', [options]),

    // Filesystem — readFile resolves to a real ArrayBuffer per the contract.
    readFile: async (filePath: string) =>
      new Uint8Array((await dispatch('readFile', [filePath])) as number[]).buffer,
    getFileStats: (filePath: string) => dispatch('getFileStats', [filePath]),
    computeFileHash: (filePath: string) => dispatch('computeFileHash', [filePath]),
    writeFile: (filePath: string, data: ArrayBuffer | string) =>
      dispatch('writeFile', [
        filePath,
        typeof data === 'string' ? data : Array.from(new Uint8Array(data)),
      ]),

    // Shell
    openPath: (filePath: string) => dispatch('openPath', [filePath]),
    openExternal: (url: string) => dispatch('openExternal', [url]),

    // App
    getVersion: () => dispatch('getVersion', []),
    getPath: (name: string) => dispatch('getPath', [name]),

    // Backend
    getBackendStatus: () => dispatch('getBackendStatus', []),
    getBackendUrl: () => dispatch('getBackendUrl', []),
    getBackendToken: () => dispatch('getBackendToken', []),
    restartBackend: () => dispatch('restartBackend', []),
    onBackendStatusChanged: (callback: (s: Json) => void) => {
      statusListeners.add(callback)
      ensurePoller()
      return () => {
        statusListeners.delete(callback)
      }
    },

    // Updater — inert in tests, but methods exist so UpdateNotification mounts.
    checkForUpdates: () => dispatch('checkForUpdates', []),
    downloadUpdate: () => dispatch('downloadUpdate', []),
    installUpdate: () => dispatch('installUpdate', []),
    onUpdateAvailable: () => () => {},
    onUpdateNotAvailable: () => () => {},
    onUpdateDownloadProgress: () => () => {},
    onUpdateDownloaded: () => () => {},
    onUpdateError: () => () => {},

    // Help-menu navigation — no native menu in a browser; never fires.
    onHelpNavigate: () => () => {},
  }

  ;(window as unknown as { electron: typeof bridge }).electron = bridge
}
