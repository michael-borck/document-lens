/**
 * Coverage workflow: count keyword matches per document, optionally
 * rolled up by a tag axis (lens).
 *
 * All matching is local-only — no backend round-trip per analysis. The
 * extracted text is already in the documents table from the import
 * pipeline. Search is case-insensitive whole-word (escaped regex).
 *
 * Synonym matching is NOT included in v1; will be added when the
 * Discover/Synonyms workflow is wired (Phase 5).
 */

import { selectAll } from './db'
import { listKeywords, getKeywordListLenses } from './keyword-lists'
import { listLensValues } from './lenses'
import { type DocumentRow, rowToDocument } from './_shared/document-row'
import type {
  Document,
  Keyword,
  KeywordPolarity,
  LensValue,
} from '@/types/data'

export interface CoverageMatrix {
  documents: Document[]
  keywords: Keyword[]
  /** counts[documentId][keywordId] = match count */
  counts: Record<string, Record<string, number>>
  /** Set of (documentId, lensValueId) totals when a lens is selected. */
  lensTotals: Record<string, Record<string, number>> | null
  lensValues: LensValue[] | null
  polarity: KeywordPolarity | 'both'
  /** Human-readable summary for the context strip. */
  summary: string
}

export interface ComputeCoverageInput {
  projectId: string
  keywordListId: string
  polarity: KeywordPolarity | 'both'
  lensId: string | null
}

/**
 * Run coverage. Returns one matrix; for polarity='both' the caller is
 * expected to render two side-by-side matrices by calling this twice
 * (once per polarity).
 */
export async function computeCoverage(input: ComputeCoverageInput): Promise<CoverageMatrix> {
  // 1. Load project documents (only those with extracted text are usable).
  const documents = await loadProjectDocuments(input.projectId)
  const usableDocs = documents.filter((d) => d.extractedText && d.extractedText.length > 0)

  // 2. Load keywords filtered by polarity.
  const allKeywords = await listKeywords(input.keywordListId)
  const enabled = allKeywords.filter((k) => k.enabled)
  const keywords = input.polarity === 'both'
    ? enabled
    : enabled.filter((k) => k.polarity === input.polarity)

  // 3. Per-document, per-keyword count via local regex matching.
  const counts: Record<string, Record<string, number>> = {}
  for (const doc of usableDocs) {
    counts[doc.id] = {}
    const text = doc.extractedText ?? ''
    for (const kw of keywords) {
      counts[doc.id][kw.id] = countMatches(text, kw.text)
    }
  }

  // 4. Optional lens roll-up.
  let lensTotals: Record<string, Record<string, number>> | null = null
  let lensValues: LensValue[] | null = null

  if (input.lensId) {
    const declaredLensIds = await getKeywordListLenses(input.keywordListId)
    if (declaredLensIds.includes(input.lensId)) {
      lensValues = await listLensValues(input.lensId)
      const tagsByKeyword = await loadKeywordTagsForLens(input.keywordListId, input.lensId)

      lensTotals = {}
      for (const doc of usableDocs) {
        lensTotals[doc.id] = {}
        for (const value of lensValues) {
          lensTotals[doc.id][value.id] = 0
        }
        for (const kw of keywords) {
          const tagValueIds = tagsByKeyword.get(kw.id) ?? []
          const docKeywordCount = counts[doc.id][kw.id]
          if (docKeywordCount === 0) continue
          for (const valueId of tagValueIds) {
            lensTotals[doc.id][valueId] = (lensTotals[doc.id][valueId] ?? 0) + docKeywordCount
          }
        }
      }
    }
  }

  return {
    documents: usableDocs,
    keywords,
    counts,
    lensTotals,
    lensValues,
    polarity: input.polarity,
    summary: `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} across ${usableDocs.length} document${usableDocs.length === 1 ? '' : 's'}`,
  }
}

async function loadProjectDocuments(projectId: string): Promise<Document[]> {
  const rows = await selectAll<DocumentRow>(
    `SELECT d.* FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.year, d.title, d.filename`,
    [projectId]
  )
  return rows.map(rowToDocument)
}

interface KeywordTagRow {
  keyword_id: string
  value_id: string
}

async function loadKeywordTagsForLens(
  keywordListId: string,
  lensId: string
): Promise<Map<string, string[]>> {
  const rows = await selectAll<KeywordTagRow>(
    `SELECT kt.keyword_id, kt.value_id
       FROM keyword_tags kt
       JOIN keywords k ON k.id = kt.keyword_id
      WHERE k.list_id = ? AND kt.lens_id = ?`,
    [keywordListId, lensId]
  )
  const result = new Map<string, string[]>()
  for (const row of rows) {
    const list = result.get(row.keyword_id) ?? []
    list.push(row.value_id)
    result.set(row.keyword_id, list)
  }
  return result
}

/**
 * Case-insensitive whole-word match count. Escapes regex metacharacters
 * in the keyword. A keyword like "carbon offset reliance (without
 * reduction)" matches the literal phrase including the parentheses.
 */
function countMatches(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Allow word-character boundaries for single-token keywords; for
  // multi-token keywords just match the literal phrase. Both forms
  // are case-insensitive.
  const pattern = /\s/.test(keyword)
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')
  const matches = text.match(pattern)
  return matches ? matches.length : 0
}

