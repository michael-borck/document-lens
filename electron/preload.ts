import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// specific Electron APIs without exposing the entire Electron API

export interface DialogOptions {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: { name: string; extensions: string[] }[]
}

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export interface OpenFolderResult {
  canceled: boolean
  /** Importable document paths found recursively under the picked folder(s). */
  filePaths: string[]
  /** Number of folders the user selected. */
  folderCount: number
  /** True if the file cap was hit and the list was truncated. */
  truncated: boolean
}

export interface SaveDialogResult {
  canceled: boolean
  filePath?: string
}

// --- AI providers (BYOK) ---
export type AiProviderId =
  | 'anthropic' | 'openai' | 'gemini' | 'grok'
  | 'openai-compat' | 'ollama' | 'ollama-bearer'

export interface AiProviderView {
  id: AiProviderId
  label: string
  shape: 'anthropic' | 'openai' | 'gemini'
  keyMode: 'required' | 'optional' | 'none'
  baseUrl: string
  model: string | null
  hasKey: boolean
}
export interface AiProvidersSnapshot {
  active: AiProviderId | null
  encryptionAvailable: boolean
  providers: AiProviderView[]
}
export interface AiTestResult {
  ok: boolean
  models?: string[]
  error?: string
}
export interface AiSaveInput {
  baseUrl: string
  model: string | null
  key?: string
}
export interface AiDraft {
  baseUrl: string
  key?: string
}
export interface AiChatResult {
  ok: boolean
  text?: string
  provider?: string
  model?: string
  error?: string
}

export type BackendPhase =
  | 'not-started'
  | 'starting'
  | 'ready'
  | 'unreachable'
  | 'crashed'

export interface BackendStatus {
  phase: BackendPhase
  running: boolean
  url: string | null
  pid?: number
  mode: 'embedded' | 'dev-auto'
  lastError?: string
  startedAt?: number
}

export interface DatabaseResult {
  changes?: number
  lastInsertRowid?: number | bigint
}

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

// API exposed to renderer
const electronAPI = {
  // Dialog
  openFileDialog: (options?: DialogOptions): Promise<OpenDialogResult> =>
    ipcRenderer.invoke('dialog:openFile', options),
  openDirectoryDialog: (options?: DialogOptions): Promise<OpenDialogResult> =>
    ipcRenderer.invoke('dialog:openDirectory', options),
  openFolderDialog: (options?: DialogOptions): Promise<OpenFolderResult> =>
    ipcRenderer.invoke('dialog:openFolder', options),

  // AI providers (BYOK)
  aiGetProviders: (): Promise<AiProvidersSnapshot> =>
    ipcRenderer.invoke('ai:getProviders'),
  aiSaveProvider: (id: AiProviderId, input: AiSaveInput): Promise<AiProvidersSnapshot> =>
    ipcRenderer.invoke('ai:saveProvider', id, input),
  aiSetActiveProvider: (id: AiProviderId | null): Promise<AiProvidersSnapshot> =>
    ipcRenderer.invoke('ai:setActiveProvider', id),
  aiRevealKey: (id: AiProviderId): Promise<string | null> =>
    ipcRenderer.invoke('ai:revealKey', id),
  aiTestConnection: (id: AiProviderId, draft?: AiDraft): Promise<AiTestResult> =>
    ipcRenderer.invoke('ai:testConnection', id, draft),
  aiListModels: (id: AiProviderId, draft?: AiDraft): Promise<AiTestResult> =>
    ipcRenderer.invoke('ai:listModels', id, draft),
  aiChat: (system: string, user: string, maxTokens?: number): Promise<AiChatResult> =>
    ipcRenderer.invoke('ai:chat', system, user, maxTokens),
  saveFileDialog: (options?: DialogOptions): Promise<SaveDialogResult> =>
    ipcRenderer.invoke('dialog:saveFile', options),

  // Shell
  openPath: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openPath', filePath),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  // App
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),
  getPath: (name: string): Promise<string> =>
    ipcRenderer.invoke('app:getPath', name),

  // Backend
  getBackendStatus: (): Promise<BackendStatus> =>
    ipcRenderer.invoke('backend:getStatus'),
  getBackendUrl: (): Promise<string> =>
    ipcRenderer.invoke('backend:getUrl'),
  getBackendToken: (): Promise<string> =>
    ipcRenderer.invoke('backend:getToken'),
  restartBackend: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('backend:restart'),
  onBackendStatusChanged: (callback: (status: BackendStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: BackendStatus) => callback(status)
    ipcRenderer.on('backend:status-changed', handler)
    return () => ipcRenderer.removeListener('backend:status-changed', handler)
  },

  // Database — keyed access (SQL resolved from electron/queries.ts in main)
  dbSelect: <T = unknown>(key: string, params?: unknown[]): Promise<T[]> =>
    ipcRenderer.invoke('db:select', { key, params }),
  dbRunKeyed: (key: string, params?: unknown[]): Promise<DatabaseResult> =>
    ipcRenderer.invoke('db:run', { key, params }),
  dbUpdate: (
    table: string,
    columns: string[],
    idColumn: string,
    params: unknown[]
  ): Promise<DatabaseResult> =>
    ipcRenderer.invoke('db:update', { table, columns, idColumn, params }),
  dbSelectIn: <T = unknown>(key: string, ids: unknown[]): Promise<T[]> =>
    ipcRenderer.invoke('db:selectIn', { key, ids }),
  dbRunBatch: (ops: { key: string; params?: unknown[] }[]): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('db:runBatch', { ops }),

  // File system
  readFile: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  getFileStats: (filePath: string): Promise<{ size: number; mtime: number }> =>
    ipcRenderer.invoke('fs:getFileStats', filePath),
  computeFileHash: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:computeFileHash', filePath),
  writeFile: (filePath: string, data: ArrayBuffer | string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('fs:writeFile', filePath, data),

  // Auto-updater
  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string; error?: string }> =>
    ipcRenderer.invoke('updater:checkForUpdates'),
  downloadUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('updater:downloadUpdate'),
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke('updater:installUpdate'),

  // Event listeners for updates
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('update-not-available', handler)
    return () => ipcRenderer.removeListener('update-not-available', handler)
  },
  onUpdateDownloadProgress: (callback: (progress: UpdateProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: UpdateProgress) => callback(progress)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('update-error', handler)
    return () => ipcRenderer.removeListener('update-error', handler)
  },

  // Help-menu navigation — fired by the native Help > Documentation submenu
  // (see electron/menu.ts). Renderer subscribes in src/App.tsx and routes to
  // /help?topic=<id>; Help.tsx reads the search param to select the topic.
  onHelpNavigate: (callback: (topicId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, topicId: string) => callback(topicId)
    ipcRenderer.on('help:navigate', handler)
    return () => ipcRenderer.removeListener('help:navigate', handler)
  },
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electron', electronAPI)

// Type definitions for the renderer
export type ElectronAPI = typeof electronAPI
