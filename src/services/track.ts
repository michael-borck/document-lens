/**
 * Track — trend over time computation.
 *
 * Headline deliverable workflow per the methodology document. For each
 * year (where the project has documents), computes a measure value and
 * returns it as one or more series for line-chart rendering.
 *
 * Year filtering: documents with `year = null` are surfaced as a
 * separate `yearUnknown` count (NEVER silently dropped — see resolved
 * decision 4 / US-C-04).
 *
 * Computation reuses the same regex-based keyword matching as the
 * Coverage / Read workflows so trend numbers reconcile with what those
 * pages show for the same topic + year.
 */

import { selectAll } from './db'
import {
  listKeywords,
  getKeywordListLenses,
} from './keyword-lists'
import { listLensValues } from './lenses'
import {
  computeCoverage,
  type CoverageMatrix,
} from './coverage'
import {
  computeCoverage2D,
  type CoverageMatrix2D,
} from './coverage-2d'
import { getClassificationStatus } from './classification'
import type {
  Document,
  Keyword,
  KeywordPolarity,
  LensValue,
} from '@/types/data'

export type TrackMeasure = 'match-count' | 'coverage-percent' | 'score'
export type TrackGroup = 'none' | 'polarity'

/**
 * Topic to track. One of:
 *   { kind: 'all' }                — all enabled keywords (filtered by polarity)
 *   { kind: 'keyword', keywordId } — a single keyword
 *   { kind: 'lens-value', lensId, valueId } — all keywords carrying this tag
 */
export type TrackTopic =
  | { kind: 'all' }
  | { kind: 'keyword'; keywordId: string }
  | { kind: 'lens-value'; lensId: string; valueId: string }

export interface TrackPoint {
  year: number
  value: number
  documentCount: number
}

export interface TrackSeries {
  name: string
  /** Optional polarity hint so the chart can colour positive/counter consistently. */
  polarity?: KeywordPolarity
  points: TrackPoint[]
}

export interface TrackPerDocPoint {
  documentId: string
  title: string
  year: number
  value: number
  /** Polarity used to compute this doc's value (matches one of the series). */
  polarity: KeywordPolarity
}

export interface TrackResult {
  measure: TrackMeasure
  series: TrackSeries[]
  /** Documents with year = null. Always reported, never silently dropped. */
  yearUnknown: { documentCount: number; matchCount: number }
  /** Year range used (computed from the project's docs with non-null year). */
  yearRange: { min: number; max: number } | null
  /** Total doc count contributing to the trend (excluding year-unknown). */
  totalDocs: number
  /** True when the score measure was requested but classification is incomplete; the score values fall back to the v1 Pillar coverage prerequisite. */
  scoreFallback?: boolean
  /**
   * Per-document data points (only populated for measure='score' so the
   * Track chart can overlay each doc as a dot at its (year, score)
   * coordinate alongside the per-year average line). Empty for other
   * measures.
   */
  perDocument: TrackPerDocPoint[]
}

export interface ComputeTrackInput {
  projectId: string
  keywordListId: string
  topic: TrackTopic
  measure: TrackMeasure
  /** When 'none', returns a single series; when 'polarity', returns positive + counter series. */
  group: TrackGroup
  /** Per-series filter when group != 'polarity'. */
  polarity: KeywordPolarity
  /** Inclusive year bounds to clamp the trend (helpful for filtering noisy edges). */
  yearMin?: number
  yearMax?: number
  /** Active scoring rule definition — required when measure='score'. */
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

export async function computeTrack(input: ComputeTrackInput): Promise<TrackResult> {
  // Decide which polarities we need to compute. For group='polarity' we
  // run two passes, one per polarity, to avoid mixing the lines.
  const polarities: KeywordPolarity[] =
    input.group === 'polarity' ? ['positive', 'counter'] : [input.polarity]

  // Determine if score-measure can use the full Wedding Cake (function-tagged)
  // or must fall back to the v1 Pillar coverage prerequisite.
  let scoreFallback = false
  if (input.measure === 'score') {
    if (!input.scoringRule) {
      throw new Error('Score measure requires a scoring rule definition')
    }
    if (input.scoringRule.functionLensId) {
      const status = await getClassificationStatus(input.projectId, input.scoringRule.functionLensId)
      const allClassified = status.totalDocuments > 0 && status.classifiedDocuments === status.totalDocuments
      scoreFallback = !allClassified
    } else {
      scoreFallback = true
    }
  }

  const series: TrackSeries[] = []
  const perDocument: TrackPerDocPoint[] = []
  let yearUnknownDocs = 0
  let yearUnknownMatches = 0
  let totalDocs = 0
  let yearMin: number | null = null
  let yearMax: number | null = null

  for (const polarity of polarities) {
    const oneSeries = await buildSeriesForPolarity(input, polarity, scoreFallback)
    series.push(oneSeries.series)
    yearUnknownDocs = Math.max(yearUnknownDocs, oneSeries.yearUnknownDocs)
    yearUnknownMatches += oneSeries.yearUnknownMatches
    totalDocs = Math.max(totalDocs, oneSeries.totalDocs)
    if (oneSeries.yearRange) {
      yearMin = yearMin === null ? oneSeries.yearRange.min : Math.min(yearMin, oneSeries.yearRange.min)
      yearMax = yearMax === null ? oneSeries.yearRange.max : Math.max(yearMax, oneSeries.yearRange.max)
    }
    if (input.measure === 'score') {
      for (const p of oneSeries.perDocument) perDocument.push(p)
    }
  }

  return {
    measure: input.measure,
    series,
    yearUnknown: { documentCount: yearUnknownDocs, matchCount: yearUnknownMatches },
    yearRange: yearMin !== null && yearMax !== null ? { min: yearMin, max: yearMax } : null,
    totalDocs,
    scoreFallback: input.measure === 'score' ? scoreFallback : undefined,
    perDocument,
  }
}

interface SeriesBuildResult {
  series: TrackSeries
  yearUnknownDocs: number
  yearUnknownMatches: number
  totalDocs: number
  yearRange: { min: number; max: number } | null
  /** Per-document scoring data — only populated when measure='score'. */
  perDocument: TrackPerDocPoint[]
}

async function buildSeriesForPolarity(
  input: ComputeTrackInput,
  polarity: KeywordPolarity,
  scoreFallback: boolean
): Promise<SeriesBuildResult> {
  // Resolve which keywords contribute to this topic + polarity.
  const allKeywords = await listKeywords(input.keywordListId)
  const enabled = allKeywords.filter((k) => k.enabled && k.polarity === polarity)
  const topicKeywords = await filterToTopic(enabled, input.keywordListId, input.topic)

  // Load project documents.
  const docRows = await selectAll<ProjectDocRow>(
    `SELECT d.* FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?`,
    [input.projectId]
  )
  const docs = docRows.map(rowToDocument).filter((d) => d.extractedText && d.extractedText.length > 0)

  // Apply the year-min / year-max filter for the trend (year-unknown docs
  // pass through to the unknown bucket regardless).
  const yearFilteredDocs = docs.filter((d) => {
    if (d.year === null) return true
    if (input.yearMin !== undefined && d.year < input.yearMin) return false
    if (input.yearMax !== undefined && d.year > input.yearMax) return false
    return true
  })

  const knownYearDocs = yearFilteredDocs.filter((d) => d.year !== null) as Array<Document & { year: number }>
  const unknownYearDocs = yearFilteredDocs.filter((d) => d.year === null)

  // Per-document measure value lookup. For all measures, we need to
  // know per document: match count for the topic, and (for coverage %)
  // whether ≥1 keyword in the topic matched.
  const perDocMeasure = await computePerDocumentMeasure(
    input,
    topicKeywords,
    yearFilteredDocs,
    polarity,
    scoreFallback
  )

  // Aggregate by year.
  const yearBuckets = new Map<number, { matchCount: number; documentsWithMatch: number; scoreSum: number; documentCount: number }>()
  for (const doc of knownYearDocs) {
    const m = perDocMeasure.get(doc.id) ?? { matchCount: 0, hasMatch: false, score: 0 }
    const bucket = yearBuckets.get(doc.year) ?? { matchCount: 0, documentsWithMatch: 0, scoreSum: 0, documentCount: 0 }
    bucket.matchCount += m.matchCount
    if (m.hasMatch) bucket.documentsWithMatch++
    bucket.scoreSum += m.score
    bucket.documentCount++
    yearBuckets.set(doc.year, bucket)
  }

  // Year-unknown match count (sum across unknown docs).
  let yearUnknownMatchCount = 0
  for (const doc of unknownYearDocs) {
    yearUnknownMatchCount += perDocMeasure.get(doc.id)?.matchCount ?? 0
  }

  // Build sorted points.
  const sortedYears = Array.from(yearBuckets.keys()).sort((a, b) => a - b)
  const points: TrackPoint[] = sortedYears.map((year) => {
    const b = yearBuckets.get(year)!
    let value = 0
    if (input.measure === 'match-count') value = b.matchCount
    else if (input.measure === 'coverage-percent') {
      value = b.documentCount > 0 ? (b.documentsWithMatch / b.documentCount) * 100 : 0
    } else if (input.measure === 'score') {
      value = b.documentCount > 0 ? b.scoreSum / b.documentCount : 0
    }
    return { year, value, documentCount: b.documentCount }
  })

  const yearRange = sortedYears.length > 0
    ? { min: sortedYears[0], max: sortedYears[sortedYears.length - 1] }
    : null

  // Per-doc data points (only for score measure — other measures' per-doc
  // values aren't meaningful as a scatter overlay).
  const perDocument: TrackPerDocPoint[] = []
  if (input.measure === 'score') {
    for (const doc of knownYearDocs) {
      const m = perDocMeasure.get(doc.id)
      if (!m) continue
      perDocument.push({
        documentId: doc.id,
        title: doc.title ?? doc.filename,
        year: doc.year,
        value: m.score,
        polarity,
      })
    }
  }

  return {
    series: {
      name: polarity === 'positive' ? 'Positive' : 'Counter',
      polarity,
      points,
    },
    yearUnknownDocs: unknownYearDocs.length,
    yearUnknownMatches: yearUnknownMatchCount,
    totalDocs: knownYearDocs.length,
    yearRange,
    perDocument,
  }
}

interface PerDocMeasure {
  matchCount: number
  hasMatch: boolean
  score: number
}

async function computePerDocumentMeasure(
  input: ComputeTrackInput,
  topicKeywords: Keyword[],
  docs: Document[],
  polarity: KeywordPolarity,
  scoreFallback: boolean
): Promise<Map<string, PerDocMeasure>> {
  const out = new Map<string, PerDocMeasure>()

  // Match-count + coverage-% both need per-doc match counts of the topic
  // keywords. We do a fast local regex pass rather than going through
  // computeCoverage (avoids the extra lens-totals work we don't need here).
  if (input.measure === 'match-count' || input.measure === 'coverage-percent') {
    for (const doc of docs) {
      const text = doc.extractedText ?? ''
      let total = 0
      for (const kw of topicKeywords) {
        total += countMatches(text, kw.text)
      }
      out.set(doc.id, { matchCount: total, hasMatch: total > 0, score: 0 })
    }
    return out
  }

  // Score measure: need per-document score on the active scoring rule.
  if (input.measure === 'score' && input.scoringRule) {
    if (scoreFallback) {
      // v1 Pillar coverage: count required pillars positively mentioned.
      const matrix = await computeCoverage({
        projectId: input.projectId,
        keywordListId: input.keywordListId,
        polarity,
        lensId: input.scoringRule.pillarLensId,
      })
      const pillarValues = await listLensValues(input.scoringRule.pillarLensId)
      const required = input.scoringRule.requiredPillars
        .map((name) => pillarValues.find((v) => v.value === name))
        .filter((v): v is LensValue => Boolean(v))
      for (const doc of docs) {
        const totals = matrix.lensTotals?.[doc.id] ?? {}
        const score = required.filter((p) => (totals[p.id] ?? 0) > 0).length
        out.set(doc.id, { matchCount: 0, hasMatch: score > 0, score })
      }
    } else if (input.scoringRule.functionLensId) {
      // Full Wedding Cake: count Function values that satisfy all required pillars.
      const matrix2D = await computeCoverage2D({
        projectId: input.projectId,
        keywordListId: input.keywordListId,
        rowLensId: input.scoringRule.pillarLensId,
        colLensId: input.scoringRule.functionLensId,
        polarity,
      })
      const pillarValues = await listLensValues(input.scoringRule.pillarLensId)
      const functionValues = await listLensValues(input.scoringRule.functionLensId)
      const required = input.scoringRule.requiredPillars
        .map((name) => pillarValues.find((v) => v.value === name))
        .filter((v): v is LensValue => Boolean(v))
      for (const doc of docs) {
        const cells = matrix2D.cells[doc.id] ?? {}
        const score = functionValues.filter((fn) =>
          required.every((p) => (cells[p.id]?.[fn.id] ?? 0) > 0)
        ).length
        out.set(doc.id, { matchCount: 0, hasMatch: score > 0, score })
      }
    }
    return out
  }

  return out
}

async function filterToTopic(
  keywords: Keyword[],
  keywordListId: string,
  topic: TrackTopic
): Promise<Keyword[]> {
  if (topic.kind === 'all') return keywords
  if (topic.kind === 'keyword') {
    return keywords.filter((k) => k.id === topic.keywordId)
  }
  // lens-value: keep keywords that carry this (lens, value) tag.
  const declaredLensIds = await getKeywordListLenses(keywordListId)
  if (!declaredLensIds.includes(topic.lensId)) return []

  const tagRows = await selectAll<{ keyword_id: string }>(
    `SELECT kt.keyword_id
       FROM keyword_tags kt
      WHERE kt.lens_id = ? AND kt.value_id = ?`,
    [topic.lensId, topic.valueId]
  )
  const taggedIds = new Set(tagRows.map((r) => r.keyword_id))
  return keywords.filter((k) => taggedIds.has(k.id))
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

// Suppress unused-import false positive for types referenced only in JSDoc.
export type _Unused = CoverageMatrix | CoverageMatrix2D
