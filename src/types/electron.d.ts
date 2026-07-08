// Type definitions for the Electron API exposed via preload

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

export interface UpdateCheckResult {
  updateAvailable: boolean
  version?: string
  releaseDate?: string
  error?: string
}

export interface ElectronAPI {
  // Dialog
  openFileDialog: (options?: DialogOptions) => Promise<OpenDialogResult>
  openDirectoryDialog: (options?: DialogOptions) => Promise<OpenDialogResult>
  openFolderDialog: (options?: DialogOptions) => Promise<OpenFolderResult>
  saveFileDialog: (options?: DialogOptions) => Promise<SaveDialogResult>

  // Shell
  openPath: (filePath: string) => Promise<string>
  openExternal: (url: string) => Promise<void>

  // App
  getVersion: () => Promise<string>
  getPath: (name: string) => Promise<string>

  // Backend
  getBackendStatus: () => Promise<BackendStatus>
  getBackendUrl: () => Promise<string>
  getBackendToken: () => Promise<string>
  restartBackend: () => Promise<{ success: boolean; error?: string }>
  onBackendStatusChanged: (callback: (status: BackendStatus) => void) => () => void

  // Database — keyed access (SQL resolved from electron/queries.ts in main)
  dbSelect: <T = unknown>(key: string, params?: unknown[]) => Promise<T[]>
  dbRunKeyed: (key: string, params?: unknown[]) => Promise<DatabaseResult>
  dbUpdate: (
    table: string,
    columns: string[],
    idColumn: string,
    params: unknown[]
  ) => Promise<DatabaseResult>
  dbSelectIn: <T = unknown>(key: string, ids: unknown[]) => Promise<T[]>
  dbRunBatch: (ops: { key: string; params?: unknown[] }[]) => Promise<{ success: boolean }>

  // File system
  readFile: (filePath: string) => Promise<ArrayBuffer>
  getFileStats: (filePath: string) => Promise<{ size: number; mtime: number }>
  computeFileHash: (filePath: string) => Promise<string>
  writeFile: (filePath: string, data: ArrayBuffer | string) => Promise<{ success: boolean }>

  // Auto-updater
  checkForUpdates: () => Promise<UpdateCheckResult>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => Promise<void>

  // Update event listeners
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateNotAvailable: (callback: () => void) => () => void
  onUpdateDownloadProgress: (callback: (progress: UpdateProgress) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void

  // Help-menu navigation event (from the native Help > Documentation submenu).
  onHelpNavigate: (callback: (topicId: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
