import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { autoUpdater } from 'electron-updater'
import { initDatabase, getDatabase } from './database'
import { BackendManager, BACKEND_URL } from './backend-manager'

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

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
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

// Initialize app
app.whenReady().then(async () => {
  // Initialize database
  initDatabase()

  // Create window FIRST so user sees the app immediately
  createWindow()

  // Initialize backend manager
  backendManager = new BackendManager()

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

// Backend orphan-prevention strategy:
//
// The spawned Python child gets reparented to PID 1 if the Electron
// parent dies without explicit cleanup, leaving a zombie uvicorn on
// :8765. To kill it reliably we hook every exit path:
//
//   before-quit   — fires on Cmd-Q / app.quit() (skips window-all-closed
//                   on macOS), so this is the canonical clean-exit spot.
//   window-all-closed — non-macOS clean exit (and macOS dock-close on
//                   single-window apps).
//   SIGINT/SIGTERM — Ctrl-C in the dev terminal, `kill <pid>`, parent
//                   process death. Signal handlers are sync-restricted
//                   so we kick off stop() and force-exit shortly after.
//
// Idempotent: stop() is a no-op if process is already null.

let cleanupInFlight = false

async function shutdownBackend(reason: string): Promise<void> {
  if (cleanupInFlight) return
  cleanupInFlight = true
  console.log(`[Backend] shutdown trigger: ${reason}`)
  try {
    if (backendManager) await backendManager.stop()
  } catch (err) {
    console.error('[Backend] shutdown error:', err)
  }
}

app.on('before-quit', async (event) => {
  if (!backendManager || cleanupInFlight) return
  // Defer the quit until the backend has cleanly stopped, then re-fire it.
  event.preventDefault()
  await shutdownBackend('app before-quit')
  app.quit()
})

app.on('window-all-closed', async () => {
  await shutdownBackend('window-all-closed')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Signal handlers — fire on Ctrl-C / SIGTERM / nodemon restart in dev.
// The async stop() races against the OS giving us very little time, so
// we bound it with a hard force-kill timeout.
function installSignalHandlers(): void {
  const handle = (signal: NodeJS.Signals) => {
    console.log(`[Backend] caught ${signal} — shutting down child`)
    shutdownBackend(signal).finally(() => {
      // Give stop() up to 3s to land before we exit; otherwise the
      // parent dies and the child orphans anyway.
      setTimeout(() => process.exit(0), 100).unref()
    })
    // Also schedule a hard exit in case stop() hangs.
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
  return result
})

ipcMain.handle('dialog:openDirectory', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    ...options
  })
  return result
})

ipcMain.handle('dialog:saveFile', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, options)
  return result
})

// Shell handlers
ipcMain.handle('shell:openPath', async (_, filePath: string) => {
  return shell.openPath(filePath)
})

ipcMain.handle('shell:openExternal', async (_, url: string) => {
  return shell.openExternal(url)
})

// App info
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPath', (_, name: string) => {
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

// Debug: get resources path info
ipcMain.handle('debug:getResourcesInfo', () => {
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

// Database handlers - these will be expanded as needed
ipcMain.handle('db:query', async (_, { sql, params }) => {
  const db = getDatabase()
  try {
    const stmt = db.prepare(sql)
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return params ? stmt.all(...params) : stmt.all()
    } else {
      return params ? stmt.run(...params) : stmt.run()
    }
  } catch (error) {
    console.error('Database error:', error)
    throw error
  }
})

ipcMain.handle('db:exec', async (_, sql: string) => {
  const db = getDatabase()
  try {
    return db.exec(sql)
  } catch (error) {
    console.error('Database exec error:', error)
    throw error
  }
})

// File system handlers
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  } catch (error) {
    console.error('File read error:', error)
    throw error
  }
})

ipcMain.handle('fs:getFileStats', async (_, filePath: string) => {
  try {
    const stats = fs.statSync(filePath)
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
    const fileBuffer = fs.readFileSync(filePath)
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
    if (typeof data === 'string') {
      fs.writeFileSync(filePath, data, 'utf-8')
    } else {
      fs.writeFileSync(filePath, Buffer.from(data))
    }
    return { success: true }
  } catch (error) {
    console.error('File write error:', error)
    throw error
  }
})
