/**
 * Per-page text + char-offset lookup for a document.
 *
 * The backend extractor (document_processor.extract_text_with_pages)
 * joins non-empty page texts with "\n\n" to produce `extracted_text`.
 * Empty pages are skipped on both sides (backend join + import.ts
 * INSERT). Reconstructing the offset of each page in the full text is
 * therefore: walk the stored page rows in page-number order and
 * accumulate `text.length + 2` per page (the "+2" is the "\n\n"
 * separator; not added before the first page).
 *
 * This lets workflows like Read map a keyword match's character
 * position back to the page it came from, so the user can deep-link
 * (file://…#page=N) into their PDF viewer.
 */

import { selectAllKeyed } from './db'

export interface PageOffset {
  pageNumber: number
  /** Inclusive char offset of the page's first char in extracted_text. */
  charStart: number
  /** Exclusive char offset of the page's last char + 1. */
  charEnd: number
}

interface PageRow {
  page_number: number
  text: string
}

/**
 * Build a sorted list of page offset ranges for a document. Pages are
 * already ordered by page_number; offsets accumulate with a 2-char
 * separator between consecutive pages to mirror the backend's
 * "\n\n".join. Returns an empty list if the document has no stored
 * page rows (legacy imports, plain-text-only sources).
 */
export async function getPageOffsets(documentId: string): Promise<PageOffset[]> {
  const rows = await selectAllKeyed<PageRow>('documentPages.byDocument', [documentId])
  if (rows.length === 0) return []

  const out: PageOffset[] = []
  let cursor = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const start = cursor
    const end = start + r.text.length
    out.push({ pageNumber: r.page_number, charStart: start, charEnd: end })
    // "\n\n" separator between pages — not appended after the last.
    cursor = end + (i < rows.length - 1 ? 2 : 0)
  }
  return out
}

/**
 * Binary-search the offset list for the page that contains a given
 * char offset. Returns null if the offset falls in a separator gap or
 * outside any page (shouldn't happen for offsets sourced from
 * extracted_text, but defensive).
 */
export function findPageForOffset(offsets: PageOffset[], offset: number): number | null {
  if (offsets.length === 0) return null
  let lo = 0
  let hi = offsets.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const p = offsets[mid]
    if (offset < p.charStart) hi = mid - 1
    else if (offset >= p.charEnd) lo = mid + 1
    else return p.pageNumber
  }
  return null
}
