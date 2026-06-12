import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { autoUpdater } from 'electron-updater'
import { initDatabase, getDatabase, closeDatabase } from './database'
import { getQuery, getInQuery, buildUpdate } from './queries'
import { BackendManager, BACKEND_URL } from './backend-manager'
import { buildMenu } from './menu'
import {
  rememberDialogFiles,
  rememberDialogDirs,
  assertReadable,
  assertWritable,
} from './fs-guard'

// Dev-only: point userData at a throwaway profile so scripted runs (e.g.
// scripts/capture-help-screenshots.mjs) get a deterministic fresh state
// instead of touching the developer's real database. Must run before
// anything reads app.getPath('userData').
if (!app.isPackaged && process.env.DOCLENS_USER_DATA) {
  app.setPath('userData', process.env.DOCLENS_USER_DATA)
}

/** True for the only URL schemes we'll hand to the OS browser/mail client. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

/** Has the DB ever recorded this exact path as a document source? */
function isRegisteredDocument(rawPath: string): boolean {
  try {
    return !!getDatabase()
      .prepare('SELECT 1 FROM documents WHERE file_path = ? LIMIT 1')
      .get(rawPath)
  } catch {
    return false
  }
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged 
  ? process.env.DIST 
  : path.join(__dirname, '../public')

let mainWindow: BrowserWindow | null = null
let backendManager: BackendManager | null = null

// Per-launch random token. Passed to the spawned backend via env and required
// on every request except /health and /manifest (see lens-contract add_auth).
// Stops other local processes from driving the loopback backend; regenerated
// each launch so it never needs to be persisted.
const backendAuthToken = crypto.randomBytes(32).toString('hex')

// Configure auto-updater
autoUpdater.autoDownload = false // Let user decide when to download
autoUpdater.autoInstallOnAppQuit = true

// Vite dev server URL
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // Required for better-sqlite3
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false
  })

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Fallback: show window after timeout if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Fallback: showing window after timeout')
      mainWindow.show()
    }
  }, 3000)

  // Log any load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  // Open external links in browser — but only safe web schemes. Never let
  // injected content trigger file:// / custom-scheme handler launches via a
  // popup. New windows are always denied; we only forward the URL when it's a
  // plain web/mail link.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // The renderer is a single locally-loaded bundle; it should never navigate
  // the top frame away from its own origin (or the dev server in dev). This
  // blocks injected-content-driven navigation / phishing.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      if (isWebUrl(url)) shell.openExternal(url)
    }
  })

  // We never embed <webview>s; deny any attempt to attach one.
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

// Setup auto-updater event handlers
function setupAutoUpdater() {
  // Only run auto-updater in production
  if (!app.isPackaged) {
    console.log('Skipping auto-updater in development mode')
    return
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version)
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('Update not available - app is up to date')
    mainWindow?.webContents.send('update-not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${progress.percent.toFixed(1)}%`)
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version)
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error)
    mainWindow?.webContents.send('update-error', error.message)
  })

  // Check for updates after a short delay (don't block app startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('Failed to check for updates:', error)
    })
  }, 3000)
}

// Manual "Check for Updates…" from the application menu. Unlike the silent
// startup check, this always gives the user feedback (up-to-date / available /
// error) via a native dialog — the expected behaviour for an explicit check.
async function manualCheckForUpdates(): Promise<void> {
  if (!mainWindow) return
  if (!app.isPackaged) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'Updates are only available in the installed app.',
      detail: 'This is a development build — there is nothing to check.',
      buttons: ['OK'],
    })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const latest = result?.updateInfo?.version
    if (latest && latest !== app.getVersion()) {
      // The update-available handler has already shown the in-app banner; this
      // dialog confirms the menu action and points at it.
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: `An update is available: ${latest}`,
        detail: `You're on ${app.getVersion()}. You'll see a notification in the app to download and install it.`,
        buttons: ['OK'],
      })
    } else {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: "You're up to date.",
        detail: `Document Lens ${app.getVersion()} is the latest version.`,
        buttons: ['OK'],
      })
    }
  } catch (error) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      message: 'Could not check for updates.',
      detail: error instanceof Error ? error.message : String(error),
      buttons: ['OK'],
    })
  }
}

// Initialize app
app.whenReady().then(async () => {
  // Initialize database
  initDatabase()

  // Create window FIRST so user sees the app immediately
  createWindow()

  // Install the custom application menu — populates Help with the same
  // topics the in-app sidebar exposes (see electron/menu.ts). Built after
  // the window exists so menu 'click' handlers can target its webContents.
  Menu.setApplicationMenu(buildMenu(mainWindow, manualCheckForUpdates))

  // Initialize backend manager (passing the per-launch auth token)
  backendManager = new BackendManager(backendAuthToken)

  // Forward phase changes to the renderer
  backendManager.on('phase-changed', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:status-changed', status)
    }
  })

  // Start backend. In production we spawn the bundled PyInstaller executable.
  // In dev we auto-spawn uvicorn from ../document-analyser if present, otherwise
  // probe for an externally-started backend. Failures are non-fatal — local
  // features (keyword search, visualizations, export) still work.
  try {
    await backendManager.start()
  } catch (error) {
    console.warn('Could not start backend:', error)
    console.log('App will run in offline mode - local features still available')
  }

  // Setup auto-updater (only runs in production)
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Shutdown strategy — covers two resources:
//
//   Python backend child: gets reparented to PID 1 if the Electron
//     parent dies without explicit cleanup, leaving a zombie uvicorn
//     on :8765.
//   SQLite handle: better-sqlite3 holds a file lock; an open WAL on a
//     hard kill is recoverable but a clean close flushes the WAL and
//     avoids "database is locked" on next launch.
//
// Hooked into every exit path:
//   before-quit   — fires on Cmd-Q / app.quit() (skips window-all-closed
//                   on macOS), so this is the canonical clean-exit spot.
//   window-all-closed — non-macOS clean exit (and macOS dock-close on
//                   single-window apps).
//   SIGINT/SIGTERM — Ctrl-C in the dev terminal, `kill <pid>`, parent
//                   process death. Signal handlers are sync-restricted
//                   so we kick off shutdown and force-exit shortly after.
//
// Idempotent: backend stop() is a no-op if process is already null;
// closeDatabase() is a no-op if the handle is null.

let cleanupInFlight = false

async function shutdownApp(reason: string): Promise<void> {
  if (cleanupInFlight) return
  cleanupInFlight = true
  console.log(`[Shutdown] trigger: ${reason}`)
  try {
    if (backendManager) await backendManager.stop()
  } catch (err) {
    console.error('[Shutdown] backend stop error:', err)
  }
  try {
    closeDatabase()
  } catch (err) {
    console.error('[Shutdown] database close error:', err)
  }
}

app.on('before-quit', async (event) => {
  if (cleanupInFlight) return
  // Defer the quit until backend + DB have cleanly stopped, then re-fire it.
  event.preventDefault()
  await shutdownApp('app before-quit')
  app.quit()
})

app.on('window-all-closed', async () => {
  await shutdownApp('window-all-closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Signal handlers — fire on Ctrl-C / SIGTERM / nodemon restart in dev.
// The async stop() races against the OS giving us very little time, so
// we bound it with a hard force-kill timeout.
function installSignalHandlers(): void {
  const handle = (signal: NodeJS.Signals) => {
    console.log(`[Shutdown] caught ${signal}`)
    shutdownApp(signal).finally(() => {
      // Give shutdown up to 3s to land before we exit; otherwise the
      // parent dies and the child orphans anyway.
      setTimeout(() => process.exit(0), 100).unref()
    })
    // Also schedule a hard exit in case shutdown hangs.
    setTimeout(() => process.exit(1), 3000).unref()
  }
  process.on('SIGINT', handle)
  process.on('SIGTERM', handle)
  process.on('SIGHUP', handle)
}
installSignalHandlers()

// IPC Handlers

// Dialog handlers
ipcMain.handle('dialog:openFile', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    ...options
  })
  // Record the user's picks so the fs:* guard will permit reading them.
  if (!result.canceled) rememberDialogFiles(result.filePaths)
  return result
})

ipcMain.handle('dialog:openDirectory', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    ...options
  })
  if (!result.canceled) rememberDialogDirs(result.filePaths)
  return result
})

ipcMain.handle('dialog:saveFile', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, options)
  // Record the chosen save target so the fs:* guard will permit writing it.
  if (!result.canceled && result.filePath) rememberDialogFiles([result.filePath])
  return result
})

// Shell handlers
//
// Both take renderer-supplied strings, so they're confined: openPath only
// opens files the app legitimately knows (a picked file, the userData
// subtree, or a registered document); openExternal allows plain web/mail
// links, and file:// only for those same known paths (used by Read.tsx to
// open a PDF at a page via `file://…#page=N`).
ipcMain.handle('shell:openPath', async (_, filePath: string) => {
  const safe = assertReadable(filePath, isRegisteredDocument)
  return shell.openPath(safe)
})

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  if (isWebUrl(url)) return shell.openExternal(url)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Refused: malformed URL: ${url}`)
  }
  if (parsed.protocol === 'file:') {
    // Authorise the underlying path before letting the OS open it. The
    // #page=N fragment lives in parsed.hash and is preserved in `url`.
    assertReadable(decodeURIComponent(parsed.pathname), isRegisteredDocument)
    return shell.openExternal(url)
  }
  throw new Error(`Refused: disallowed URL scheme: ${parsed.protocol}`)
})

// App info
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

// The renderer only needs a handful of well-known directories; don't let it
// resolve arbitrary named paths (home, exe, …) that would feed the fs:* guard.
const ALLOWED_APP_PATHS = new Set(['userData', 'temp', 'downloads', 'documents'])
ipcMain.handle('app:getPath', (_, name: string) => {
  if (!ALLOWED_APP_PATHS.has(name)) {
    throw new Error(`Refused: app path not permitted: ${name}`)
  }
  return app.getPath(name as Parameters<typeof app.getPath>[0])
})

// Auto-updater handlers
ipcMain.handle('updater:checkForUpdates', async () => {
  if (!app.isPackaged) {
    return { updateAvailable: false, error: 'Updates only available in production builds' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    return {
      updateAvailable: result?.updateInfo != null,
      version: result?.updateInfo?.version,
      releaseDate: result?.updateInfo?.releaseDate
    }
  } catch (error) {
    console.error('Check for updates failed:', error)
    return { updateAvailable: false, error: String(error) }
  }
})

ipcMain.handle('updater:downloadUpdate', async () => {
  if (!app.isPackaged) {
    return { success: false, error: 'Updates only available in production builds' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error) {
    console.error('Download update failed:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('updater:installUpdate', () => {
  // This will quit the app and install the update
  autoUpdater.quitAndInstall(false, true)
})

// Backend status
ipcMain.handle('backend:getStatus', () => {
  return backendManager?.getStatus() ?? { running: false, url: null }
})

ipcMain.handle('backend:getUrl', () => {
  return backendManager?.getUrl() ?? BACKEND_URL
})

// The renderer sends this as `Authorization: Bearer <token>` on backend
// requests. It never leaves the machine (loopback backend only).
ipcMain.handle('backend:getToken', () => backendAuthToken)

ipcMain.handle('backend:restart', async () => {
  if (!backendManager) return { success: false, error: 'Backend manager not initialised' }
  try {
    await backendManager.restart()
    return { success: true }
  } catch (error) {
    console.error('Backend restart failed:', error)
    return { success: false, error: String(error) }
  }
})

// Debug: get resources path info
ipcMain.handle('debug:getResourcesInfo', () => {
  // Dev-only diagnostic — don't leak the install layout from a shipped build.
  if (app.isPackaged) {
    return { error: 'debug info is unavailable in production builds' }
  }
  const resourcesPath = process.resourcesPath
  const fs = require('fs')
  const path = require('path')

  const info: Record<string, unknown> = {
    resourcesPath,
    isPackaged: app.isPackaged,
    platform: process.platform
  }
  
  try {
    info.resourcesContents = fs.readdirSync(resourcesPath)
    const backendDir = path.join(resourcesPath, 'backend')
    if (fs.existsSync(backendDir)) {
      info.backendExists = true
      info.backendContents = fs.readdirSync(backendDir)
    } else {
      info.backendExists = false
    }
  } catch (e) {
    info.error = String(e)
  }
  
  return info
})

// Database handlers.
//
// The renderer sends a registry KEY (resolved against electron/queries.ts),
// never raw SQL — see the module docstring there for the threat model. There
// is deliberately no raw-SQL or DDL handler: schema changes run in
// database.ts at init, never from the renderer.

// Keyed SELECT — resolves SQL from the registry, returns rows.
ipcMain.handle('db:select', async (_, { key, params }) => {
  const db = getDatabase()
  try {
    const stmt = db.prepare(getQuery(key))
    return params ? stmt.all(...params) : stmt.all()
  } catch (error) {
    console.error(`Database select error [${key}]:`, error)
    throw error
  }
})

// Keyed INSERT/UPDATE/DELETE — resolves SQL from the registry, returns
// { changes, lastInsertRowid }.
ipcMain.handle('db:run', async (_, { key, params }) => {
  const db = getDatabase()
  try {
    const stmt = db.prepare(getQuery(key))
    return params ? stmt.run(...params) : stmt.run()
  } catch (error) {
    console.error(`Database run error [${key}]:`, error)
    throw error
  }
})

// Validated dynamic partial UPDATE — column identifiers come from the
// renderer but are checked against a per-table allowlist before the SQL is
// assembled in main (see buildUpdate). Values are bound as parameters.
ipcMain.handle('db:update', async (_, { table, columns, idColumn, params }) => {
  const db = getDatabase()
  try {
    const stmt = db.prepare(buildUpdate(table, columns, idColumn))
    return params ? stmt.run(...params) : stmt.run()
  } catch (error) {
    console.error(`Database update error [${table}]:`, error)
    throw error
  }
})

// Atomic batch of keyed INSERT/UPDATE/DELETEs — runs every op inside ONE
// better-sqlite3 transaction, so a mid-sequence failure rolls the whole group
// back instead of leaving half-written rows (e.g. a document without its
// pages/sections, or a cleared-but-not-repopulated lens set). Each op's SQL is
// still resolved from the registry, preserving the no-raw-SQL boundary.
ipcMain.handle('db:runBatch', async (_, { ops }: { ops: { key: string; params?: unknown[] }[] }) => {
  const db = getDatabase()
  const tx = db.transaction((operations: { key: string; params?: unknown[] }[]) => {
    for (const op of operations) {
      const stmt = db.prepare(getQuery(op.key))
      if (op.params) stmt.run(...op.params)
      else stmt.run()
    }
  })
  try {
    tx(ops)
    return { success: true }
  } catch (error) {
    console.error('Database batch error:', error)
    throw error
  }
})

// Keyed SELECT with a variable-length IN (...) list. The registry SQL holds
// an __IN__ marker; main expands it to the right number of placeholders and
// binds the ids as parameters.
ipcMain.handle('db:selectIn', async (_, { key, ids }) => {
  const db = getDatabase()
  try {
    const stmt = db.prepare(getInQuery(key, ids.length))
    return stmt.all(...ids)
  } catch (error) {
    console.error(`Database selectIn error [${key}]:`, error)
    throw error
  }
})

// File system handlers
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    const safe = assertReadable(filePath, isRegisteredDocument)
    const buffer = fs.readFileSync(safe)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } catch (error) {
    console.error('File read error:', error)
    throw error
  }
})

ipcMain.handle('fs:getFileStats', async (_, filePath: string) => {
  try {
    const safe = assertReadable(filePath, isRegisteredDocument)
    const stats = fs.statSync(safe)
    return {
      size: stats.size,
      mtime: stats.mtimeMs
    }
  } catch (error) {
    console.error('File stats error:', error)
    throw error
  }
})

ipcMain.handle('fs:computeFileHash', async (_, filePath: string) => {
  try {
    const safe = assertReadable(filePath, isRegisteredDocument)
    const fileBuffer = fs.readFileSync(safe)
    const hashSum = crypto.createHash('sha256')
    hashSum.update(fileBuffer)
    return hashSum.digest('hex')
  } catch (error) {
    console.error('File hash computation error:', error)
    throw error
  }
})

ipcMain.handle('fs:writeFile', async (_, filePath: string, data: ArrayBuffer | string) => {
  try {
    const safe = assertWritable(filePath)
    if (typeof data === 'string') {
      fs.writeFileSync(safe, data, 'utf-8')
    } else {
      fs.writeFileSync(safe, Buffer.from(data))
    }
    return { success: true }
  } catch (error) {
    console.error('File write error:', error)
    throw error
  }
})
