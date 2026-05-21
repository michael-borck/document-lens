import { selectAllKeyed, selectOneKeyed, runStatementKeyed, updateRow, newId, now } from './db'
import type { Document } from '@/types/data'
import { type DocumentRow, rowToDocument } from './_shared/document-row'

export async function listDocuments(): Promise<Document[]> {
  const rows = await selectAllKeyed<DocumentRow>('documents.list')
  return rows.map(rowToDocument)
}

export async function getDocument(id: string): Promise<Document | null> {
  const row = await selectOneKeyed<DocumentRow>('documents.getById', [id])
  return row ? rowToDocument(row) : null
}

export async function getDocumentByHash(fileHash: string): Promise<Document | null> {
  const row = await selectOneKeyed<DocumentRow>('documents.getByHash', [fileHash])
  return row ? rowToDocument(row) : null
}

export interface CreateDocumentInput {
  filename: string
  filePath: string
  fileHash: string
  fileSize?: number
  title?: string
  year?: number | null
  company?: string
  sector?: string
}

/**
 * Insert a fresh document. Caller is expected to have already
 * deduplicated against getDocumentByHash() — this throws on UNIQUE
 * collision.
 */
export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const id = newId()
  await runStatementKeyed('documents.create', [
    id,
    input.filename,
    input.filePath,
    input.fileHash,
    input.fileSize ?? null,
    input.title ?? null,
    input.year ?? null,
    input.company ?? null,
    input.sector ?? null,
    'pending',
    now(),
  ])
  const created = await getDocument(id)
  if (!created) throw new Error(`Failed to create document ${input.filename}`)
  return created
}

export interface UpdateDocumentAttributesInput {
  title?: string | null
  year?: number | null
  company?: string | null
  sector?: string | null
}

/**
 * Update user-editable attributes (US-X-06). Doesn't touch
 * extraction/status fields — those are managed by the import pipeline.
 */
export async function updateDocumentAttributes(
  id: string,
  patch: UpdateDocumentAttributesInput
): Promise<void> {
  const columns: string[] = []
  const params: unknown[] = []

  if (patch.title !== undefined) { columns.push('title'); params.push(patch.title) }
  if (patch.year !== undefined) { columns.push('year'); params.push(patch.year) }
  if (patch.company !== undefined) { columns.push('company'); params.push(patch.company) }
  if (patch.sector !== undefined) { columns.push('sector'); params.push(patch.sector) }

  if (columns.length === 0) return
  params.push(id)
  await updateRow('documents', columns, 'id', params)
}

export async function deleteDocument(id: string): Promise<void> {
  await runStatementKeyed('documents.deleteById', [id])
}

export async function countDocumentsInProject(projectId: string): Promise<number> {
  const row = await selectOneKeyed<{ n: number }>('documents.countInProject', [projectId])
  return row?.n ?? 0
}

/**
 * True when the document's file_path is a synthetic "source unavailable"
 * marker written by the bundle importer for docs that arrived without
 * their original source file. Such docs have full extracted text +
 * sections + tags (analysis works) but no on-disk source for Preview /
 * Open in viewer.
 */
export function isSourceMissing(doc: Document): boolean {
  return doc.filePath.startsWith('lens-bundle://')
}

export type RelinkResult =
  | { ok: true }
  | { ok: false; reason: 'file-not-found' | 'unreadable' | 'hash-mismatch'; expectedHash?: string; actualHash?: string }

/**
 * Re-attach a source file to a document whose file_path was lost
 * (typically because it arrived via bundle import without bundled
 * files, or the file was moved on disk). Picks a candidate file from
 * the user, hashes it, verifies it matches the document's stored
 * file_hash, and updates file_path on success. Refuses to attach a
 * mismatched file so the integrity of every existing analysis (text,
 * sections, tags) stays intact.
 */
export async function relinkDocumentSource(
  documentId: string,
  candidatePath: string
): Promise<RelinkResult> {
  const electron = window.electron
  if (!electron) return { ok: false, reason: 'unreadable' }

  const doc = await getDocument(documentId)
  if (!doc) return { ok: false, reason: 'file-not-found' }

  let actualHash: string
  try {
    actualHash = await electron.computeFileHash(candidatePath)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  if (actualHash !== doc.fileHash) {
    return {
      ok: false,
      reason: 'hash-mismatch',
      expectedHash: doc.fileHash,
      actualHash,
    }
  }

  await runStatementKeyed('documents.updateFilePath', [candidatePath, documentId])
  return { ok: true }
}
