/**
 * Coverage workflow: count keyword matches per document, optionally
 * rolled up by a tag axis (lens).
 *
 * All matching is local-only — no backend round-trip per analysis. The
 * extracted text is already in the documents table from the import
 * pipeline. Counting (case-insensitive whole-word / phrase, with accepted
 * synonyms folded in) comes from the shared Project Corpus so Coverage,
 * Track, and Compare reconcile by construction.
 */

import { selectAll } from './db'
import { getKeywordListLenses } from './keyword-lists'
import { listLensValues } from './lenses'
import { loadProjectCorpus } from './_shared/project-corpus'
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
  // 1. Load the corpus (usable docs + enabled keywords for the polarity +
  //    synonym-aware counting).
  const corpus = await loadProjectCorpus({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: input.polarity,
  })
  const usableDocs = corpus.docs
  const keywords = corpus.keywords

  // 2. Per-document, per-keyword count. Each keyword's tally folds in its
  //    accepted (enabled) synonyms (US-A-04) — handled inside the corpus.
  const counts: Record<string, Record<string, number>> = {}
  for (const doc of usableDocs) {
    counts[doc.id] = {}
    for (const kw of keywords) {
      counts[doc.id][kw.id] = corpus.countFor(doc.id, kw.id)
    }
  }

  // 3. Optional lens roll-up.
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

interface KeywordTagRow {
  keyword_id: string
  value_id: string
}

async function loadKeywordTagsForLens(
  keywordListId: string,
  lensId: string
): Promise<Map<string, string[]>> {
  const rows = await selectAll<KeywordTagRow>('keywords.tagsForList', [keywordListId, lensId])
  const result = new Map<string, string[]>()
  for (const row of rows) {
    const list = result.get(row.keyword_id) ?? []
    list.push(row.value_id)
    result.set(row.keyword_id, list)
  }
  return result
}
