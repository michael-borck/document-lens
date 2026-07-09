import type { Document, DocumentStatus } from '@/types/data'
import { parseJson } from '../db'

export interface DocumentRow {
  id: string
  filename: string
  file_path: string
  file_hash: string
  file_size: number | null
  title: string | null
  year: number | null
  company: string | null
  sector: string | null
  type: string | null
  company_size: string | null
  page_count: number | null
  word_count: number | null
  extracted_text: string | null
  pdf_metadata: string | null
  status: DocumentStatus
  status_error: string | null
  imported_at: string
  extracted_at: string | null
}

export function rowToDocument(row: DocumentRow): Document {
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
    type: row.type,
    companySize: row.company_size,
    pageCount: row.page_count,
    wordCount: row.word_count,
    extractedText: row.extracted_text,
    pdfMetadata: row.pdf_metadata
      ? parseJson<Record<string, unknown>>(row.pdf_metadata, {})
      : null,
    status: row.status,
    statusError: row.status_error,
    importedAt: row.imported_at,
    extractedAt: row.extracted_at,
  }
}
