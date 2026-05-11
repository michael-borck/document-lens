import { selectAll, selectOne, runStatement, parseJson, newId, now } from './db'
import type { Document, DocumentStatus } from '@/types/data'

interface DocumentRow {
  id: string
  filename: string
  file_path: string
  file_hash: string
  file_size: number | null
  title: string | null
  year: number | null
  company: string | null
  sector: string | null
  page_count: number | null
  word_count: number | null
  extracted_text: string | null
  pdf_metadata: string | null
  status: DocumentStatus
  status_error: string | null
  imported_at: string
  extracted_at: string | null
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    filename: row.filename,
    filePath: row.file_path,
    fileHash: row.file_hash,
    fileSize: row.file_size,
    title: row.title,
    year: row.year,
    company: row.company,
    sector: row.sector,
    pageCount: row.page_count,
    wordCount: row.word_count,
    extractedText: row.extracted_text,
    pdfMetadata: row.pdf_metadata ? parseJson<Record<string, unknown>>(row.pdf_metadata, {}) : null,
    status: row.status,
    statusError: row.status_error,
    importedAt: row.imported_at,
    extractedAt: row.extracted_at,
  }
}

export async function listDocuments(): Promise<Document[]> {
  const rows = await selectAll<DocumentRow>(
    'SELECT * FROM documents ORDER BY imported_at DESC'
  )
  return rows.map(rowToDocument)
}

export async function getDocument(id: string): Promise<Document | null> {
  const row = await selectOne<DocumentRow>('SELECT * FROM documents WHERE id = ?', [id])
  return row ? rowToDocument(row) : null
}

export async function getDocumentByHash(fileHash: string): Promise<Document | null> {
  const row = await selectOne<DocumentRow>(
    'SELECT * FROM documents WHERE file_hash = ?',
    [fileHash]
  )
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
  await runStatement(
    `INSERT INTO documents
       (id, filename, file_path, file_hash, file_size, title, year, company, sector,
        status, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ]
  )
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
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.title !== undefined) { fields.push('title = ?'); params.push(patch.title) }
  if (patch.year !== undefined) { fields.push('year = ?'); params.push(patch.year) }
  if (patch.company !== undefined) { fields.push('company = ?'); params.push(patch.company) }
  if (patch.sector !== undefined) { fields.push('sector = ?'); params.push(patch.sector) }

  if (fields.length === 0) return
  params.push(id)
  await runStatement(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`, params)
}

export async function deleteDocument(id: string): Promise<void> {
  await runStatement('DELETE FROM documents WHERE id = ?', [id])
}

export async function countDocumentsInProject(projectId: string): Promise<number> {
  const row = await selectOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM project_documents WHERE project_id = ?',
    [projectId]
  )
  return row?.n ?? 0
}
