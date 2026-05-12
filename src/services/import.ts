/**
 * Document import pipeline.
 *
 * For each file the user picks:
 *   1. Hash the file (SHA-256) and check Library for an existing
 *      document with the same hash. If found, mark as duplicate and
 *      skip — don't re-extract.
 *   2. Insert a row into `documents` with status='pending'.
 *   3. Call document-analyser's POST /files/upload-path to extract
 *      text + metadata + total_pages.
 *   4. Update the row with extracted_text + page_count + word_count +
 *      status='extracted'. Title and year are auto-populated from
 *      file metadata where possible — user can edit later (US-X-06).
 *   5. On any failure, set status='failed' with the error message.
 *
 * The pipeline is sequential per file (not parallel) so the user sees
 * predictable progress and the backend isn't hammered with concurrent
 * extractions. Future work: parallelise with a small concurrency limit.
 */

import {
  getDocumentByHash,
  createDocument,
  getDocument,
} from './documents'
import { runStatement, now, stringifyJson } from './db'
import { api } from './api'
import type { Document } from '@/types/data'

export type ImportPhase =
  | 'hashing'
  | 'extracting'
  | 'completed'
  | 'duplicate'
  | 'failed'

export interface ImportProgress {
  total: number
  current: number
  currentFile: string
  phase: ImportPhase
  error?: string
}

export interface ImportItemResult {
  filePath: string
  filename: string
  document: Document | null   // null only on failure
  phase: 'completed' | 'duplicate' | 'failed'
  error?: string
}

export interface ImportResult {
  total: number
  completed: number
  duplicates: number
  failed: number
  items: ImportItemResult[]
}

/**
 * Import a list of file paths into the global Library. Returns a per-
 * file result summary plus aggregate counts.
 *
 * Caller is expected to have obtained the paths via the native file
 * dialog (window.electron.openFileDialog) — this function does not
 * open dialogs itself.
 */
export async function importDocuments(
  filePaths: string[],
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const items: ImportItemResult[] = []
  let completed = 0
  let duplicates = 0
  let failed = 0

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i]
    const filename = basename(filePath)

    onProgress?.({
      total: filePaths.length,
      current: i + 1,
      currentFile: filename,
      phase: 'hashing',
    })

    try {
      const result = await importOne(filePath, filename, (phase) => {
        onProgress?.({
          total: filePaths.length,
          current: i + 1,
          currentFile: filename,
          phase,
        })
      })
      items.push(result)
      if (result.phase === 'completed') completed++
      else if (result.phase === 'duplicate') duplicates++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[import] Failed to import ${filename}:`, err)
      items.push({
        filePath,
        filename,
        document: null,
        phase: 'failed',
        error: message,
      })
      failed++
      onProgress?.({
        total: filePaths.length,
        current: i + 1,
        currentFile: filename,
        phase: 'failed',
        error: message,
      })
    }
  }

  return { total: filePaths.length, completed, duplicates, failed, items }
}

async function importOne(
  filePath: string,
  filename: string,
  onPhase: (phase: ImportPhase) => void
): Promise<ImportItemResult> {
  // 1. Hash + dedup check.
  const electron = window.electron
  if (!electron) throw new Error('Electron API not available')

  const fileHash = await electron.computeFileHash(filePath)
  const existing = await getDocumentByHash(fileHash)
  if (existing) {
    return {
      filePath,
      filename,
      document: existing,
      phase: 'duplicate',
    }
  }

  // 2. Get file size.
  const stats = await electron.getFileStats(filePath).catch(() => null)
  const fileSize = stats?.size

  // 3. Insert pending row.
  const created = await createDocument({
    filename,
    filePath,
    fileHash,
    fileSize,
    title: stripExtension(filename),
  })

  onPhase('extracting')

  // 4. Call backend to extract.
  try {
    const response = await api.processFilePath(filePath, {
      include_extracted_text: true,
    })

    const extractedText = response.extracted_text?.full_text ?? ''
    const pageCount = response.extracted_text?.total_pages ?? null
    const wordCount = extractedText
      ? extractedText.split(/\s+/).filter(Boolean).length
      : null

    // Title: prefer the PDF metadata title if present; otherwise filename.
    const title = response.metadata?.title?.trim() || stripExtension(filename)

    // Year: layered per resolved decision 4 (revised 2026-05-12).
    //   1. Filename regex first — deterministic and usually right.
    //   2. Backend content inference (probable_year) as fallback.
    //   3. null if neither — user edits inline on Library page.
    const year = detectYearFromFilename(filename) ?? response.inferred?.probable_year ?? null

    // Company: no reliable filename signal, so just use the backend's
    // content inference. null if not detected.
    const company = response.inferred?.probable_company?.trim() || null

    await runStatement(
      `UPDATE documents
         SET title = ?,
             year = ?,
             company = ?,
             page_count = ?,
             word_count = ?,
             extracted_text = ?,
             pdf_metadata = ?,
             status = 'extracted',
             status_error = NULL,
             extracted_at = ?
       WHERE id = ?`,
      [
        title,
        year,
        company,
        pageCount,
        wordCount,
        extractedText,
        response.metadata ? stringifyJson(response.metadata) : null,
        now(),
        created.id,
      ]
    )

    // Per-page text storage (IA-8). Wired now even though no UI consumes
    // it yet — page-aware concordance (US-G-03) and the embedded PDF
    // viewer (US-G-04) both need this; storing at import time means
    // users won't have to re-import their corpus when those land.
    const pages = response.extracted_text?.pages ?? []
    if (pages.length > 0) {
      // Clear any prior page rows for this document (defensive — would
      // only matter on a re-extract path that doesn't exist yet).
      await runStatement('DELETE FROM document_pages WHERE document_id = ?', [created.id])
      for (const page of pages) {
        if (page.text && page.text.trim().length > 0) {
          await runStatement(
            'INSERT INTO document_pages (document_id, page_number, text) VALUES (?, ?, ?)',
            [created.id, page.page_number, page.text]
          )
        }
      }
    }

    const updated = await getDocument(created.id)
    onPhase('completed')
    return {
      filePath,
      filename,
      document: updated,
      phase: 'completed',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await runStatement(
      `UPDATE documents SET status = 'failed', status_error = ? WHERE id = ?`,
      [message, created.id]
    )
    return {
      filePath,
      filename,
      document: created,
      phase: 'failed',
      error: message,
    }
  }
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? filename : filename.slice(0, dot)
}

/**
 * Look for a 4-digit year in the filename (1990-2039). Strips the
 * extension first so a `.pdf` doesn't pollute the match. Prefers the
 * first hit so `acme-2023-q3-fy2024.pdf` resolves to 2023 (the year
 * the document is about, typically named first).
 *
 * Matches resolved decision 4: filename-only year detection — no PDF
 * content sniffing, no fallback to creation_date metadata. The user
 * can fix wrong/missing years inline on the Library page.
 */
function detectYearFromFilename(filename: string): number | null {
  const base = stripExtension(filename)
  const match = base.match(/(?:^|[^0-9])((?:19[9]\d|20[0-3]\d))(?:[^0-9]|$)/)
  return match ? parseInt(match[1], 10) : null
}
