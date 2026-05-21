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
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
