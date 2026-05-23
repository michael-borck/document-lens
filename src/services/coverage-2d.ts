/**
 * Two-axis coverage: keyword matches grouped by both a keyword-attached
 * lens (rows, e.g., SDG or Pillar) and a document-context lens (columns,
 * e.g., Function). Produces the SDG × Function cross-tabulation matrix
 * the methodology document calls for, plus per-document and project-
 * aggregate views.
 *
 * Each match's row value comes from the keyword's keyword_tags row;
 * each match's column value comes from looking up which section the
 * match lands in (by character offset) and reading that section's
 * section_lens_tags row.
 *
 * Matches without both tags are skipped (with a count returned so the
 * UI can show "X matches couldn't be placed in the matrix because the
 * keyword has no SDG tag" or similar).
 */

import { selectAll } from './db'
import { getKeywordListLenses } from './keyword-lists'
import { listLensValues } from './lenses'
import {
  listSections,
  getSectionTagsForDocument,
  type DocumentSection,
} from './sections'
import { loadProjectCorpus } from './_shared/project-corpus'
import type {
  Document,
  KeywordPolarity,
  LensValue,
} from '@/types/data'

export interface CoverageMatrix2D {
  documents: Document[]
  rowLens: { id: string; name: string }
  colLens: { id: string; name: string }
  rowValues: LensValue[]
  colValues: LensValue[]
  /** Per-document cell counts: cells[docId][rowValueId][colValueId] = count. */
  cells: Record<string, Record<string, Record<string, number>>>
  /** Aggregate cell counts summed across all documents. */
  aggregate: Record<string, Record<string, number>>
  /** Total matches across the project (for percentage calculations). */
  totalMatches: number
  /** Matches dropped because keyword had no rowLens tag. */
  unplacedNoKeywordTag: number
  /** Matches dropped because the section had no colLens tag. */
  unplacedNoSectionTag: number
  /** Matches dropped because the match position didn't land in any classified section. */
  unplacedOutsideSections: number
}

interface KeywordTagRow {
  keyword_id: string
  value_id: string
}

export interface ComputeCoverage2DInput {
  projectId: string
  keywordListId: string
  /** Lens whose values become the rows (must be keyword-attached). */
  rowLensId: string
  /** Lens whose values become the columns (must be document-context). */
  colLensId: string
  /** Filter keywords to this polarity. */
  polarity: KeywordPolarity
}

export async function computeCoverage2D(
  input: ComputeCoverage2DInput
): Promise<CoverageMatrix2D> {
  // Load lens values + names.
  const rowValues = await listLensValues(input.rowLensId)
  const colValues = await listLensValues(input.colLensId)
  const rowLens = await loadLensSummary(input.rowLensId)
  const colLens = await loadLensSummary(input.colLensId)

  // Verify the row lens is declared by the keyword list.
  const declaredLensIds = await getKeywordListLenses(input.keywordListId)
  if (!declaredLensIds.includes(input.rowLensId)) {
    throw new Error(
      `Row lens "${rowLens.name}" isn't declared by the active keyword list — keywords don't carry tags for it.`
    )
  }

  // Load the corpus (usable docs + enabled keywords for the polarity +
  // synonym-aware match positions). A synonym match contributes a mention at
  // its position, attributed to the parent keyword's row-lens tags (US-A-04).
  const corpus = await loadProjectCorpus({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: input.polarity,
  })
  const keywords = corpus.keywords
  if (keywords.length === 0) {
    return emptyMatrix(rowLens, colLens, rowValues, colValues)
  }

  // Load keyword -> rowValueId mappings (keyword_tags joined to lens_id = rowLensId).
  const keywordTagRows = await selectAll<KeywordTagRow>('keywords.tagsForList', [
    input.keywordListId,
    input.rowLensId,
  ])
  const keywordRowValueIds = new Map<string, string[]>()
  for (const row of keywordTagRows) {
    const list = keywordRowValueIds.get(row.keyword_id) ?? []
    list.push(row.value_id)
    keywordRowValueIds.set(row.keyword_id, list)
  }

  // Usable project documents come from the corpus.
  const usableDocs = corpus.docs

  // Initialise cell maps.
  const cells: Record<string, Record<string, Record<string, number>>> = {}
  const aggregate: Record<string, Record<string, number>> = {}
  for (const rv of rowValues) {
    aggregate[rv.id] = {}
    for (const cv of colValues) aggregate[rv.id][cv.id] = 0
  }

  let totalMatches = 0
  let unplacedNoKeywordTag = 0
  let unplacedNoSectionTag = 0
  let unplacedOutsideSections = 0

  for (const doc of usableDocs) {
    cells[doc.id] = {}
    for (const rv of rowValues) {
      cells[doc.id][rv.id] = {}
      for (const cv of colValues) cells[doc.id][rv.id][cv.id] = 0
    }

    const sections = await listSections(doc.id)
    if (sections.length === 0) continue
    const sectionTags = await getSectionTagsForDocument(doc.id, input.colLensId)

    for (const kw of keywords) {
      const rowValueIds = keywordRowValueIds.get(kw.id)
      const spans = corpus.spansFor(doc.id, kw.id)
      if (!rowValueIds || rowValueIds.length === 0) {
        // Count once per match — we need to know how many matches this contributes.
        unplacedNoKeywordTag += spans.length
        continue
      }

      // Find every match position. For each, look up section + col tag.
      for (const position of spans.map((s) => s.start)) {
        totalMatches++
        const section = findSectionContaining(sections, position)
        if (!section) {
          unplacedOutsideSections++
          continue
        }
        const colTag = sectionTags.get(section.id)
        if (!colTag) {
          unplacedNoSectionTag++
          continue
        }
        for (const rowValueId of rowValueIds) {
          cells[doc.id][rowValueId][colTag.valueId]++
          aggregate[rowValueId][colTag.valueId]++
        }
      }
    }
  }

  return {
    documents: usableDocs,
    rowLens,
    colLens,
    rowValues,
    colValues,
    cells,
    aggregate,
    totalMatches,
    unplacedNoKeywordTag,
    unplacedNoSectionTag,
    unplacedOutsideSections,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMatrix(
  rowLens: { id: string; name: string },
  colLens: { id: string; name: string },
  rowValues: LensValue[],
  colValues: LensValue[]
): CoverageMatrix2D {
  return {
    documents: [],
    rowLens,
    colLens,
    rowValues,
    colValues,
    cells: {},
    aggregate: {},
    totalMatches: 0,
    unplacedNoKeywordTag: 0,
    unplacedNoSectionTag: 0,
    unplacedOutsideSections: 0,
  }
}

async function loadLensSummary(lensId: string): Promise<{ id: string; name: string }> {
  const rows = await selectAll<{ id: string; name: string }>('lenses.getIdName', [lensId])
  if (rows.length === 0) throw new Error(`Lens ${lensId} not found`)
  return rows[0]
}

/**
 * Binary search for the section whose [start_offset, end_offset) range
 * contains the given character offset. Sections are assumed sorted by
 * sectionIndex (and therefore by start_offset since indices are
 * monotonic in the splitter). Returns null if the offset doesn't land
 * in any section.
 */
function findSectionContaining(
  sections: DocumentSection[],
  offset: number
): DocumentSection | null {
  let lo = 0
  let hi = sections.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = sections[mid]
    if (offset < s.startOffset) hi = mid - 1
    else if (offset >= s.endOffset) lo = mid + 1
    else return s
  }
  return null
}

