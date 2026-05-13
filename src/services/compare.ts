/**
 * Compare workflow — rank documents by a single metric.
 *
 * "Track without time": the same per-document measures Track aggregates
 * by year, here we just sort all docs by the metric value and rank.
 * Useful for "which company / report scores highest on this framework".
 */

import { selectAll } from './db'
import { listKeywords, getKeywordListLenses } from './keyword-lists'
import { listLensValues } from './lenses'
import { computeCoverage } from './coverage'
import { computeCoverage2D } from './coverage-2d'
import { getClassificationStatus } from './classification'
import type {
  Document,
  KeywordPolarity,
  LensValue,
} from '@/types/data'

export type CompareMetric =
  | 'match-count'        // sum of (positive | counter) keyword matches
  | 'distinct-keywords'  // count of unique enabled keywords with ≥1 match
  | 'pos-minus-counter'  // positive matches minus counter matches
  | 'score'              // active scoring rule output (Wedding Cake / fallback)

export type CompareGroup = 'none' | 'company' | 'year' | 'sector'

export interface ComparePoint {
  documentId: string
  title: string
  year: number | null
  company: string | null
  sector: string | null
  /** Numeric value the bar chart plots. */
  value: number
  /** When score metric: per-function or per-pillar breakdown. */
  breakdown?: Record<string, number>
}

export interface CompareResult {
  metric: CompareMetric
  /** Sorted desc by value. */
  points: ComparePoint[]
  group: CompareGroup
  /** Score-fallback flag — true when score metric falls back to v1 Pillar coverage. */
  scoreFallback?: boolean
  /** Documents excluded from ranking (no extracted text). */
  excluded: number
}

export interface ComputeCompareInput {
  projectId: string
  keywordListId: string
  metric: CompareMetric
  /** Filter inclusion: only docs matching all of these survive into the ranking. */
  yearMin?: number
  yearMax?: number
  companies?: string[]    // empty / undefined = no filter
  sectors?: string[]
  /** Polarity filter (used by match-count and distinct-keywords). */
  polarity: KeywordPolarity
  /** Visual grouping (colours bars by attribute; doesn't change ranking order). */
  group: CompareGroup
  /** Required for score metric. */
  scoringRule?: {
    pillarLensId: string
    functionLensId?: string
    requiredPillars: string[]
  }
}

interface ProjectDocRow {
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
  status: 'pending' | 'extracting' | 'extracted' | 'failed'
  status_error: string | null
  imported_at: string
  extracted_at: string | null
}

function rowToDocument(row: ProjectDocRow): Document {
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
    pdfMetadata: null,
    status: row.status,
    statusError: row.status_error,
    importedAt: row.imported_at,
    extractedAt: row.extracted_at,
  }
}

export async function computeCompare(input: ComputeCompareInput): Promise<CompareResult> {
  // 1. Score-fallback detection (mirrors Score / Track logic).
  let scoreFallback = false
  if (input.metric === 'score') {
    if (!input.scoringRule) {
      throw new Error('Score metric requires a scoring rule definition')
    }
    if (input.scoringRule.functionLensId) {
      const status = await getClassificationStatus(input.projectId, input.scoringRule.functionLensId)
      const allClassified = status.totalDocuments > 0 && status.classifiedDocuments === status.totalDocuments
      scoreFallback = !allClassified
    } else {
      scoreFallback = true
    }
  }

  // 2. Load + filter project documents.
  const docRows = await selectAll<ProjectDocRow>(
    `SELECT d.* FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?`,
    [input.projectId]
  )
  const allDocs = docRows.map(rowToDocument)
  const usableDocs = allDocs.filter((d) => d.extractedText && d.extractedText.length > 0)
  const excluded = allDocs.length - usableDocs.length

  const filteredDocs = usableDocs.filter((d) => {
    if (input.yearMin !== undefined && (d.year === null || d.year < input.yearMin)) return false
    if (input.yearMax !== undefined && (d.year === null || d.year > input.yearMax)) return false
    if (input.companies && input.companies.length > 0 && !(d.company && input.companies.includes(d.company))) return false
    if (input.sectors && input.sectors.length > 0 && !(d.sector && input.sectors.includes(d.sector))) return false
    return true
  })

  if (filteredDocs.length === 0) {
    return { metric: input.metric, points: [], group: input.group, excluded }
  }

  // 3. Compute per-doc metric value.
  const points: ComparePoint[] = []
  if (input.metric === 'match-count' || input.metric === 'distinct-keywords') {
    const keywords = (await listKeywords(input.keywordListId))
      .filter((k) => k.enabled && k.polarity === input.polarity)
    for (const doc of filteredDocs) {
      const text = doc.extractedText ?? ''
      let total = 0
      let distinctHits = 0
      for (const kw of keywords) {
        const n = countMatches(text, kw.text)
        total += n
        if (n > 0) distinctHits++
      }
      const value = input.metric === 'match-count' ? total : distinctHits
      points.push(makePoint(doc, value))
    }
  } else if (input.metric === 'pos-minus-counter') {
    const allKeywords = await listKeywords(input.keywordListId)
    const positives = allKeywords.filter((k) => k.enabled && k.polarity === 'positive')
    const counters = allKeywords.filter((k) => k.enabled && k.polarity === 'counter')
    for (const doc of filteredDocs) {
      const text = doc.extractedText ?? ''
      let pos = 0, neg = 0
      for (const kw of positives) pos += countMatches(text, kw.text)
      for (const kw of counters) neg += countMatches(text, kw.text)
      points.push(makePoint(doc, pos - neg, { positive: pos, counter: neg }))
    }
  } else if (input.metric === 'score' && input.scoringRule) {
    const pillarValues = await listLensValues(input.scoringRule.pillarLensId)
    const required = input.scoringRule.requiredPillars
      .map((name) => pillarValues.find((v) => v.value === name))
      .filter((v): v is LensValue => Boolean(v))

    if (scoreFallback) {
      // v1 Pillar coverage prerequisite.
      const matrix = await computeCoverage({
        projectId: input.projectId,
        keywordListId: input.keywordListId,
        polarity: 'positive',
        lensId: input.scoringRule.pillarLensId,
      })
      for (const doc of filteredDocs) {
        const totals = matrix.lensTotals?.[doc.id] ?? {}
        const score = required.filter((p) => (totals[p.id] ?? 0) > 0).length
        const breakdown: Record<string, number> = {}
        for (const p of required) breakdown[p.displayName ?? p.value] = totals[p.id] ?? 0
        points.push(makePoint(doc, score, breakdown))
      }
    } else if (input.scoringRule.functionLensId) {
      // Full Wedding Cake.
      const functionValues = await listLensValues(input.scoringRule.functionLensId)
      const declaredLensIds = await getKeywordListLenses(input.keywordListId)
      if (!declaredLensIds.includes(input.scoringRule.pillarLensId)) {
        throw new Error('Active keyword list does not declare the Pillar lens; cannot score.')
      }
      const matrix2D = await computeCoverage2D({
        projectId: input.projectId,
        keywordListId: input.keywordListId,
        rowLensId: input.scoringRule.pillarLensId,
        colLensId: input.scoringRule.functionLensId,
        polarity: 'positive',
      })
      for (const doc of filteredDocs) {
        const cells = matrix2D.cells[doc.id] ?? {}
        const score = functionValues.filter((fn) =>
          required.every((p) => (cells[p.id]?.[fn.id] ?? 0) > 0)
        ).length
        const breakdown: Record<string, number> = {}
        for (const fn of functionValues) {
          const satisfies = required.every((p) => (cells[p.id]?.[fn.id] ?? 0) > 0)
          breakdown[fn.displayName ?? fn.value] = satisfies ? 1 : 0
        }
        points.push(makePoint(doc, score, breakdown))
      }
    }
  }

  // 4. Sort desc by value, then by title for stability.
  points.sort((a, b) => b.value - a.value || a.title.localeCompare(b.title))

  return {
    metric: input.metric,
    points,
    group: input.group,
    scoreFallback: input.metric === 'score' ? scoreFallback : undefined,
    excluded,
  }
}

function makePoint(doc: Document, value: number, breakdown?: Record<string, number>): ComparePoint {
  return {
    documentId: doc.id,
    title: doc.title ?? doc.filename,
    year: doc.year,
    company: doc.company,
    sector: doc.sector,
    value,
    breakdown,
  }
}

function countMatches(text: string, keyword: string): number {
  if (!text || !keyword) return 0
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = /\s/.test(keyword)
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')
  const matches = text.match(pattern)
  return matches ? matches.length : 0
}
