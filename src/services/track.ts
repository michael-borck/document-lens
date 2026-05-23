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
import { getKeywordListLenses } from './keyword-lists'
import { loadProjectCorpus, type ProjectCorpus } from './_shared/project-corpus'
import { evaluateScore, type ScoreEvaluation, type ScoringMode } from './scoring'
import type {
  Document,
  Keyword,
  KeywordPolarity,
  ScoringRuleDefinition,
} from '@/types/data'

export type TrackMeasure = 'match-count' | 'coverage-percent' | 'score'
export type TrackGroup = 'none' | 'polarity' | 'company' | 'sector'

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
  /** Active scoring rule definition (raw, carries `type`) — required when measure='score'. */
  scoringRule?: ScoringRuleDefinition
}

/**
 * One axis of grouping for the track output. Polarity grouping splits
 * by positive/counter; company/sector grouping splits by document
 * attribute (one series per unique value found in the project).
 */
interface SeriesSpec {
  name: string
  polarity: KeywordPolarity
  /** Per-doc filter applied before per-doc measure computation. null = no filter. */
  docFilter: ((doc: Document) => boolean) | null
}

export async function computeTrack(input: ComputeTrackInput): Promise<TrackResult> {
  // Build the list of series we need to compute.
  const seriesSpecs = await resolveSeriesSpecs(input)

  // For the score measure, evaluate the rule once per distinct polarity the
  // series need (the Score Evaluator owns mode + matrix selection + counting).
  // Mode is project-uniform, so scoreFallback follows from it.
  let scoreEvalByPolarity: Map<KeywordPolarity, ScoreEvaluation> | null = null
  let scoreMode: ScoringMode | undefined
  if (input.measure === 'score') {
    if (!input.scoringRule) {
      throw new Error('Score measure requires a scoring rule definition')
    }
    scoreEvalByPolarity = new Map()
    for (const pol of new Set(seriesSpecs.map((s) => s.polarity))) {
      const evaluation = await evaluateScore({
        projectId: input.projectId,
        keywordListId: input.keywordListId,
        definition: input.scoringRule,
        polarity: pol,
      })
      scoreEvalByPolarity.set(pol, evaluation)
      scoreMode = evaluation.mode
    }
  }
  const scoreFallback = scoreMode === 'v1-prerequisite'

  const series: TrackSeries[] = []
  const perDocument: TrackPerDocPoint[] = []
  let yearUnknownDocs = 0
  let yearUnknownMatches = 0
  let totalDocs = 0
  let yearMin: number | null = null
  let yearMax: number | null = null

  for (const spec of seriesSpecs) {
    const oneSeries = await buildSeriesForSpec(input, spec, scoreEvalByPolarity?.get(spec.polarity) ?? null)
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

async function resolveSeriesSpecs(input: ComputeTrackInput): Promise<SeriesSpec[]> {
  if (input.group === 'polarity') {
    return [
      { name: 'Positive', polarity: 'positive', docFilter: null },
      { name: 'Counter', polarity: 'counter', docFilter: null },
    ]
  }
  if (input.group === 'company' || input.group === 'sector') {
    const field = input.group  // 'company' | 'sector'
    // Pull distinct attribute values from the project's docs (skipping null/empty).
    const rows = await selectAll<{ value: string }>(
      field === 'company'
        ? 'track.distinctCompanyInProject'
        : 'track.distinctSectorInProject',
      [input.projectId]
    )
    if (rows.length === 0) {
      // No docs have a value for this field — fall back to a single-series
      // result using the user's polarity, named "(no <field>)" so the legend
      // is honest.
      return [
        {
          name: `(no ${field})`,
          polarity: input.polarity,
          docFilter: null,
        },
      ]
    }
    return rows.map((r) => ({
      name: r.value,
      polarity: input.polarity,
      docFilter: (doc) => (field === 'company' ? doc.company : doc.sector) === r.value,
    }))
  }
  // group === 'none'
  return [{ name: polarityLabel(input.polarity), polarity: input.polarity, docFilter: null }]
}

function polarityLabel(p: KeywordPolarity): string {
  return p === 'positive' ? 'Positive' : 'Counter'
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

async function buildSeriesForSpec(
  input: ComputeTrackInput,
  spec: SeriesSpec,
  scoreEval: ScoreEvaluation | null
): Promise<SeriesBuildResult> {
  const polarity = spec.polarity
  // Load the corpus for this polarity (usable docs + enabled keywords + counts).
  const corpus = await loadProjectCorpus({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity,
  })
  const topicKeywords = await filterToTopic(corpus.keywords, input.keywordListId, input.topic)

  // Apply the per-series doc filter (e.g., this series is for company "Acme").
  const allDocs = corpus.docs
  const docs = spec.docFilter ? allDocs.filter(spec.docFilter) : allDocs

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
    corpus,
    topicKeywords,
    yearFilteredDocs,
    scoreEval
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
      name: spec.name,
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
  corpus: ProjectCorpus,
  topicKeywords: Keyword[],
  docs: Document[],
  scoreEval: ScoreEvaluation | null
): Promise<Map<string, PerDocMeasure>> {
  const out = new Map<string, PerDocMeasure>()

  // Match-count + coverage-% both need per-doc match counts of the topic
  // keywords. The corpus's synonym-aware counts are the same ones Coverage
  // uses, so the numbers reconcile across tabs by construction.
  if (input.measure === 'match-count' || input.measure === 'coverage-percent') {
    for (const doc of docs) {
      let total = 0
      for (const kw of topicKeywords) {
        total += corpus.countFor(doc.id, kw.id)
      }
      out.set(doc.id, { matchCount: total, hasMatch: total > 0, score: 0 })
    }
    return out
  }

  // Score measure: read the per-document score from the Score Evaluator (which
  // owns the Wedding-Cake math + full/v1 mode decision).
  if (input.measure === 'score') {
    for (const doc of docs) {
      const score = scoreEval?.perDocument.get(doc.id)?.score ?? 0
      out.set(doc.id, { matchCount: 0, hasMatch: score > 0, score })
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

  const tagRows = await selectAll<{ keyword_id: string }>('keywords.idsByLensValue', [
    topic.lensId,
    topic.valueId,
  ])
  const taggedIds = new Set(tagRows.map((r) => r.keyword_id))
  return keywords.filter((k) => taggedIds.has(k.id))
}

