/**
 * Pure sort + search logic for the document Library (US-X-16).
 *
 * Extracted from `pages/Library.tsx` so the ordering / filtering rules can be
 * unit-tested without mounting the React component. The page imports these and
 * only owns the surrounding state (which column, which direction, the query
 * string); the actual comparison and matching rules live here.
 */
import type { Document } from '@/types/data'

/** Columns the Library table can be sorted by. */
export type SortKey =
  | 'title'
  | 'type'
  | 'year'
  | 'company'
  | 'sector'
  | 'companySize'
  | 'status'
  | 'pageCount'
  | 'wordCount'

export type SortDir = 'asc' | 'desc'

/** Comparable value for a document on a given sort key. */
export function sortValue(doc: Document, key: SortKey): string | number | null {
  switch (key) {
    case 'title': return (doc.title ?? doc.filename).toLowerCase()
    case 'type': return doc.type?.toLowerCase() ?? null
    case 'company': return doc.company?.toLowerCase() ?? null
    case 'sector': return doc.sector?.toLowerCase() ?? null
    case 'companySize': return doc.companySize?.toLowerCase() ?? null
    case 'status': return doc.status
    case 'year': return doc.year
    case 'pageCount': return doc.pageCount
    case 'wordCount': return doc.wordCount
  }
}

/** Sort comparator with nulls always last, regardless of direction. */
export function compareDocs(a: Document, b: Document, key: SortKey, dir: SortDir): number {
  const av = sortValue(a, key)
  const bv = sortValue(b, key)
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  const cmp = typeof av === 'number' && typeof bv === 'number'
    ? av - bv
    : String(av).localeCompare(String(bv))
  return dir === 'asc' ? cmp : -cmp
}

/**
 * Case-insensitive substring match across the searchable fields
 * (title, filename, company, sector, type). `query` is matched verbatim —
 * callers trim/lowercase once and pass the normalised value in.
 */
export function matchesSearch(doc: Document, query: string): boolean {
  if (!query) return true
  return [doc.title, doc.filename, doc.company, doc.sector, doc.type].some(
    (v) => v != null && v.toLowerCase().includes(query)
  )
}

/**
 * Apply the Library's search-then-sort pipeline. Search filters first; sorting
 * is optional (when `sort` is null the incoming order — imported_at DESC — is
 * preserved so the newest imports stay on top). Never mutates `documents`.
 */
export function filterAndSortDocuments(
  documents: Document[],
  search: string,
  sort: { key: SortKey; dir: SortDir } | null
): Document[] {
  const q = search.trim().toLowerCase()
  let rows = q ? documents.filter((d) => matchesSearch(d, q)) : documents
  if (sort) rows = [...rows].sort((a, b) => compareDocs(a, b, sort.key, sort.dir))
  return rows
}
