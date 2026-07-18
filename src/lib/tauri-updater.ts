/**
 * Auto-update over tauri-plugin-updater, presented as the electron-updater-style
 * contract the renderer already speaks (checkForUpdates / downloadUpdate /
 * installUpdate + on* events). This lets UpdateNotification.tsx work unchanged.
 *
 * The mechanism differs from electron-updater: Tauri checks a signed static
 * `latest.json` (endpoint + Ed25519 pubkey in tauri.conf.json) rather than
 * probing GitHub releases. Download and install are two steps on the same
 * Update handle, so we hold it between calls. Local listener registries stand in
 * for the main-process event emitter — everything lives in this one renderer.
 */

import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import type { UpdateInfo, UpdateProgress } from '@/types/electron'

type Listener<T> = (v: T) => void

const listeners = {
  available: new Set<Listener<UpdateInfo>>(),
  notAvailable: new Set<Listener<void>>(),
  progress: new Set<Listener<UpdateProgress>>(),
  downloaded: new Set<Listener<UpdateInfo>>(),
  error: new Set<Listener<string>>(),
}

function emit<T>(set: Set<Listener<T>>, value: T): void {
  for (const l of set) l(value)
}

function subscribe<T>(set: Set<Listener<T>>, cb: Listener<T>): () => void {
  set.add(cb)
  return () => set.delete(cb)
}

/** The update found by the last successful check, awaiting download/install. */
let pending: Update | null = null

function infoOf(u: Update): UpdateInfo {
  return { version: u.version, releaseDate: u.date, releaseNotes: u.body }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function checkForUpdates(): Promise<{
  updateAvailable: boolean
  version?: string
  error?: string
}> {
  try {
    const update = await check()
    if (update) {
      pending = update
      emit(listeners.available, infoOf(update))
      return { updateAvailable: true, version: update.version }
    }
    emit(listeners.notAvailable, undefined)
    return { updateAvailable: false }
  } catch (e) {
    const error = messageOf(e)
    emit(listeners.error, error)
    return { updateAvailable: false, error }
  }
}

export async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  if (!pending) return { success: false, error: 'No update to download — check for updates first.' }
  try {
    let total = 0
    let transferred = 0
    let lastTime = performance.now()
    let lastTransferred = 0
    await pending.download((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
      } else if (event.event === 'Progress') {
        transferred += event.data.chunkLength
        const now = performance.now()
        const dt = (now - lastTime) / 1000
        const bytesPerSecond = dt > 0 ? (transferred - lastTransferred) / dt : 0
        if (dt >= 0.25) {
          lastTime = now
          lastTransferred = transferred
        }
        const percent = total > 0 ? (transferred / total) * 100 : 0
        emit(listeners.progress, { percent, bytesPerSecond, total, transferred })
      } else if (event.event === 'Finished') {
        emit(listeners.downloaded, infoOf(pending!))
      }
    })
    return { success: true }
  } catch (e) {
    const error = messageOf(e)
    emit(listeners.error, error)
    return { success: false, error }
  }
}

export async function installUpdate(): Promise<void> {
  if (!pending) return
  // The update was already downloaded by downloadUpdate(); install + relaunch.
  await pending.install()
  await relaunch()
}

export const onUpdateAvailable = (cb: Listener<UpdateInfo>) => subscribe(listeners.available, cb)
export const onUpdateNotAvailable = (cb: Listener<void>) => subscribe(listeners.notAvailable, cb)
export const onUpdateDownloadProgress = (cb: Listener<UpdateProgress>) => subscribe(listeners.progress, cb)
export const onUpdateDownloaded = (cb: Listener<UpdateInfo>) => subscribe(listeners.downloaded, cb)
export const onUpdateError = (cb: Listener<string>) => subscribe(listeners.error, cb)
