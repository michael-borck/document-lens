/**
 * Document headings — the deterministic layout pass's output (ADR-0040),
 * persisted at import. The PDF on disk is the source of truth; this table
 * is a cache the pass can rebuild over the whole Library at any time.
 *
 * Offsets are in extracted_text coordinates, the same coordinate system
 * sections, page offsets, and suppressed spans use — every consumer joins
 * by offset, never by re-parsing.
 */

import { selectAll, type BatchOp } from './db'

export interface DocumentHeading {
  documentId: string
  pageNumber: number
  text: string
  fontSize: number
  bold: boolean
  /** Inclusive char offset in extracted_text. */
  startOffset: number
  /** Exclusive char offset in extracted_text. */
  endOffset: number
}

interface HeadingRow {
  document_id: string
  page_number: number
  text: string
  font_size: number
  bold: number
  start_offset: number
  end_offset: number
}

function rowToHeading(row: HeadingRow): DocumentHeading {
  return {
    documentId: row.document_id,
    pageNumber: row.page_number,
    text: row.text,
    fontSize: row.font_size,
    bold: Boolean(row.bold),
    startOffset: row.start_offset,
    endOffset: row.end_offset,
  }
}

export async function listDocumentHeadings(documentId: string): Promise<DocumentHeading[]> {
  const rows = await selectAll<HeadingRow>('documentHeadings.byDocument', [documentId])
  return rows.map(rowToHeading)
}

export interface HeadingOp {
  pageNumber: number
  text: string
  fontSize: number
  bold: boolean
  startOffset: number
  endOffset: number
}

/**
 * Build the clear-then-insert ops that replace a document's headings
 * inside a caller's larger import batch — exposed as ops (rather than
 * executing here) so headings and extracted text commit atomically, the
 * same way pages do (import.ts).
 */
export function replaceDocumentHeadingsOps(
  documentId: string,
  headings: HeadingOp[]
): BatchOp[] {
  if (headings.length === 0) return []
  return [
    { key: 'documentHeadings.deleteByDocument', params: [documentId] },
    ...headings.map((h) => ({
      key: 'documentHeadings.insert',
      params: [
        documentId,
        h.pageNumber,
        h.text,
        h.fontSize,
        h.bold ? 1 : 0,
        h.startOffset,
        h.endOffset,
      ],
    })),
  ]
}
