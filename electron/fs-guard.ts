/**
 * Path guard for the fs:* IPC handlers — the filesystem security boundary.
 *
 * The renderer can ask main to read/write arbitrary absolute paths over IPC
 * (fs:readFile / fs:writeFile / fs:computeFileHash / fs:getFileStats). Without
 * a guard, a compromised renderer (e.g. XSS from imported document content)
 * could read ~/.ssh/id_rsa or overwrite a LaunchAgent. This module confines
 * those operations to paths the app legitimately needs:
 *
 *   - the userData subtree (the DB, lens-imports, caches);
 *   - files/dirs the user explicitly picked via a native dialog THIS session;
 *   - (reads only) paths registered as a document source in the DB, so the
 *     PDF viewer and bundle export can reach originals across restarts.
 *
 * Anything else throws. The set of dialog paths is in-memory and per-session
 * by design: a renderer can't widen it without going through a real dialog,
 * which requires user interaction.
 */
import { app } from 'electron'
import path from 'path'

// Files the user picked via openFile or targeted via saveFile this session.
const dialogFiles = new Set<string>()
// Directories the user picked via openDirectory this session (allowed as
// prefixes — any file beneath them is reachable).
const dialogDirs = new Set<string>()

export function rememberDialogFiles(paths: string[]): void {
  for (const p of paths) dialogFiles.add(path.resolve(p))
}

export function rememberDialogDirs(paths: string[]): void {
  for (const p of paths) dialogDirs.add(path.resolve(p))
}

function userDataRoot(): string {
  return path.resolve(app.getPath('userData'))
}

/** True if `child` is `parent` itself or nested beneath it (no `..` escape). */
function isUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isWithinAllowedDir(resolved: string): boolean {
  if (isUnder(resolved, userDataRoot())) return true
  for (const dir of dialogDirs) {
    if (isUnder(resolved, dir)) return true
  }
  return false
}

/**
 * Resolve + authorise a write. Allowed: the userData subtree, a directory the
 * user picked, or an exact file path chosen in an open/save dialog this
 * session. Throws otherwise. Returns the resolved path to use.
 */
export function assertWritable(filePath: string): string {
  const resolved = path.resolve(filePath)
  if (isWithinAllowedDir(resolved) || dialogFiles.has(resolved)) return resolved
  throw new Error(`Refused: write to a path outside the permitted set: ${filePath}`)
}

/**
 * Resolve + authorise a read. Everything a write allows, plus any path the DB
 * already knows as a document source (checked via the injected predicate
 * against the raw, as-stored path string).
 */
export function assertReadable(
  filePath: string,
  isRegisteredDocument: (rawPath: string) => boolean
): string {
  const resolved = path.resolve(filePath)
  if (isWithinAllowedDir(resolved) || dialogFiles.has(resolved)) return resolved
  if (isRegisteredDocument(filePath)) return resolved
  throw new Error(`Refused: read of a path outside the permitted set: ${filePath}`)
}
