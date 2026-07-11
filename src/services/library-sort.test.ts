import { describe, it, expect } from 'vitest'
import type { Document } from '@/types/data'
import {
  sortValue,
  compareDocs,
  matchesSearch,
  filterAndSortDocuments,
} from './library-sort'

// Minimal Document factory — only the fields the sort/search logic reads.
function doc(over: Partial<Document>): Document {
  return {
    id: over.id ?? 'd-' + Math.random().toString(36).slice(2),
    filename: 'file.pdf',
    filePath: '/tmp/file.pdf',
    fileHash: 'h',
    fileSize: null,
    title: null,
    year: null,
    company: null,
    sector: null,
    type: null,
    companySize: null,
    pageCount: null,
    wordCount: null,
    extractedText: null,
    pdfMetadata: null,
    status: 'extracted',
    statusError: null,
    importedAt: '2026-01-01T00:00:00Z',
    extractedAt: null,
    ...over,
  }
}

describe('sortValue', () => {
  it('falls back to filename (lowercased) when title is missing', () => {
    expect(sortValue(doc({ title: null, filename: 'Report.PDF' }), 'title')).toBe('report.pdf')
  })

  it('lowercases string keys and returns null for missing values', () => {
    expect(sortValue(doc({ company: 'Acme Corp' }), 'company')).toBe('acme corp')
    expect(sortValue(doc({ company: null }), 'company')).toBeNull()
  })

  it('returns raw numbers for numeric keys', () => {
    expect(sortValue(doc({ year: 2023 }), 'year')).toBe(2023)
    expect(sortValue(doc({ wordCount: 5000 }), 'wordCount')).toBe(5000)
    expect(sortValue(doc({ pageCount: null }), 'pageCount')).toBeNull()
  })
})

describe('compareDocs', () => {
  it('sorts strings case-insensitively ascending', () => {
    const a = doc({ company: 'apple' })
    const b = doc({ company: 'Banana' })
    expect(compareDocs(a, b, 'company', 'asc')).toBeLessThan(0)
    expect(compareDocs(a, b, 'company', 'desc')).toBeGreaterThan(0)
  })

  it('sorts numbers ascending and descending', () => {
    const older = doc({ year: 2019 })
    const newer = doc({ year: 2024 })
    expect(compareDocs(older, newer, 'year', 'asc')).toBeLessThan(0)
    expect(compareDocs(older, newer, 'year', 'desc')).toBeGreaterThan(0)
  })

  it('keeps nulls last regardless of sort direction', () => {
    const has = doc({ year: 2020 })
    const missing = doc({ year: null })
    // null is always the larger (goes last) in both directions
    expect(compareDocs(has, missing, 'year', 'asc')).toBeLessThan(0)
    expect(compareDocs(has, missing, 'year', 'desc')).toBeLessThan(0)
    expect(compareDocs(missing, has, 'year', 'asc')).toBeGreaterThan(0)
    expect(compareDocs(missing, has, 'year', 'desc')).toBeGreaterThan(0)
  })

  it('treats two nulls as equal', () => {
    expect(compareDocs(doc({ year: null }), doc({ year: null }), 'year', 'asc')).toBe(0)
  })

  it('nulls stay last after a full sort in both directions', () => {
    const rows = [doc({ year: null, id: 'x' }), doc({ year: 2021, id: 'a' }), doc({ year: 2019, id: 'b' })]
    const asc = [...rows].sort((a, b) => compareDocs(a, b, 'year', 'asc')).map((d) => d.id)
    const desc = [...rows].sort((a, b) => compareDocs(a, b, 'year', 'desc')).map((d) => d.id)
    expect(asc).toEqual(['b', 'a', 'x'])
    expect(desc).toEqual(['a', 'b', 'x'])
  })
})

describe('matchesSearch', () => {
  const d = doc({ title: 'Annual Report', filename: 'acme-2023.pdf', company: 'Acme', sector: 'Energy', type: 'Report' })

  it('matches across title, filename, company, sector, and type', () => {
    expect(matchesSearch(d, 'annual')).toBe(true)
    expect(matchesSearch(d, 'acme-2023')).toBe(true)
    expect(matchesSearch(d, 'acme')).toBe(true)
    expect(matchesSearch(d, 'energy')).toBe(true)
    expect(matchesSearch(d, 'report')).toBe(true)
  })

  it('matches fields case-insensitively against an already-normalised query', () => {
    // matchesSearch lowercases the field side only; the caller normalises the
    // query (filterAndSortDocuments does this). So an uppercase field still
    // matches a lowercased query substring.
    expect(matchesSearch(doc({ sector: 'ENERGY' }), 'ener')).toBe(true)
  })

  it('does not match unrelated text and ignores null fields', () => {
    expect(matchesSearch(d, 'nonexistent')).toBe(false)
    expect(matchesSearch(doc({ title: null, filename: 'x.pdf' }), 'y')).toBe(false)
  })

  it('empty query matches everything', () => {
    expect(matchesSearch(d, '')).toBe(true)
  })
})

describe('filterAndSortDocuments', () => {
  const rows = [
    doc({ id: 'c', title: 'Zulu', company: 'Acme', importedAt: '2026-03-01T00:00:00Z' }),
    doc({ id: 'a', title: 'Alpha', company: 'Beta Corp', importedAt: '2026-02-01T00:00:00Z' }),
    doc({ id: 'b', title: 'Mike', company: 'Acme', importedAt: '2026-01-01T00:00:00Z' }),
  ]

  it('preserves incoming order when no sort is set', () => {
    expect(filterAndSortDocuments(rows, '', null).map((d) => d.id)).toEqual(['c', 'a', 'b'])
  })

  it('filters by search then sorts', () => {
    const out = filterAndSortDocuments(rows, 'acme', { key: 'title', dir: 'asc' })
    expect(out.map((d) => d.id)).toEqual(['b', 'c']) // both Acme, sorted by title
  })

  it('trims and lowercases the query', () => {
    expect(filterAndSortDocuments(rows, '  BETA  ', null).map((d) => d.id)).toEqual(['a'])
  })

  it('does not mutate the input array', () => {
    const original = [...rows]
    filterAndSortDocuments(rows, '', { key: 'title', dir: 'desc' })
    expect(rows).toEqual(original)
  })
})
