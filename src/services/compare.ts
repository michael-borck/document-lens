/**
 * Compare workflow — rank documents by a single metric.
 *
 * "Track without time": the same per-document measures Track aggregates
 * by year, here we just sort all docs by the metric value and rank.
 * Useful for "which company / report scores highest on this framework".
 */

import { selectOne, selectAll } from './db'
import { loadProjectCorpus } from './_shared/project-corpus'
import { computeSubstanceSignals, evidenceReuseRatio, substanceConfidence } from './substance'
import { getKeywordListAxes } from './keyword-lists'
import { evaluateScore } from './scoring'
import type {
  Document,
  KeywordPolarity,
  ScoringRuleDefinition,
} from '@/types/data'

export type CompareMetric =
  | 'match-count'        // sum of (positive | counter) keyword matches
  | 'distinct-keywords'  // count of unique enabled keywords with ≥1 match
  | 'pos-minus-counter'  // positive matches minus counter matches
  | 'score'              // active scoring rule output (Wedding Cake / fallback)
  | 'repetition'         // substance: matches per unique keyword (loud-but-thin)
  | 'diversity'          // substance: fraction of keyword set touched (0–1)
  | 'intensity'          // substance: matches per 1,000 words (size-normalised)
  | 'evidence-reuse'     // substance: share of matches on multi-pillar keywords (0–1)

export type CompareGroup = 'none' | 'company' | 'year' | 'sector' | 'type' | 'companySize'

export interface ComparePoint {
  documentId: string
  title: string
  year: number | null
  company: string | null
  sector: string | null
  type: string | null
  companySize: string | null
  /** Numeric value the bar chart plots. */
  value: number
  /** Evidence confidence (0–1); set only for substance metrics. */
  confidence?: number
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
  /** When set, ranking was narrowed to a single keyword (display label). */
  keywordLabel?: string
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
  types?: string[]
  companySizes?: string[]
  /** Polarity filter (used by match-count and distinct-keywords). */
  polarity: KeywordPolarity
  /**
   * When set (and metric is match-count or distinct-keywords), narrow the
   * metric to a single keyword. Lets the user ask "which doc talks most
   * about *circular economy*". Ignored for pos-minus-counter and score
   * (those metrics need the whole keyword set).
   */
  keywordId?: string
  /** Visual grouping (colours bars by attribute; doesn't change ranking order). */
  group: CompareGroup
  /** Required for score metric — raw rule definition (carries `type`). */
  scoringRule?: ScoringRuleDefinition
}

export async function computeCompare(input: ComputeCompareInput): Promise<CompareResult> {
  // 1. Score metric needs a rule; the Score Evaluator decides full vs v1 mode.
  if (input.metric === 'score' && !input.scoringRule) {
    throw new Error('Score metric requires a scoring rule definition')
  }
  let scoreFallback: boolean | undefined

  // 2. Load the corpus (usable docs + enabled keywords both polarities +
  //    synonym-aware counts), then figure out how many docs were excluded.
  const corpus = await loadProjectCorpus({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: 'both',
  })
  const totalDocs =
    (await selectOne<{ n: number }>('documents.countInProject', [input.projectId]))?.n ?? 0
  const excluded = totalDocs - corpus.docs.length

  const filteredDocs = corpus.docs.filter((d) => {
    if (input.yearMin !== undefined && (d.year === null || d.year < input.yearMin)) return false
    if (input.yearMax !== undefined && (d.year === null || d.year > input.yearMax)) return false
    if (input.companies && input.companies.length > 0 && !(d.company && input.companies.includes(d.company))) return false
    if (input.sectors && input.sectors.length > 0 && !(d.sector && input.sectors.includes(d.sector))) return false
    if (input.types && input.types.length > 0 && !(d.type && input.types.includes(d.type))) return false
    if (input.companySizes && input.companySizes.length > 0 && !(d.companySize && input.companySizes.includes(d.companySize))) return false
    return true
  })

  if (filteredDocs.length === 0) {
    return { metric: input.metric, points: [], group: input.group, excluded }
  }

  // 3. Compute per-doc metric value.
  const points: ComparePoint[] = []
  let keywordLabel: string | undefined
  if (input.metric === 'match-count' || input.metric === 'distinct-keywords') {
    let keywords = corpus.keywords.filter((k) => k.polarity === input.polarity)
    if (input.keywordId) {
      keywords = keywords.filter((k) => k.id === input.keywordId)
      keywordLabel = keywords[0]?.text
    }
    for (const doc of filteredDocs) {
      let total = 0
      let distinctHits = 0
      for (const kw of keywords) {
        const n = corpus.countFor(doc.id, kw.id)
        total += n
        if (n > 0) distinctHits++
      }
      const value = input.metric === 'match-count' ? total : distinctHits
      points.push(makePoint(doc, value))
    }
  } else if (
    input.metric === 'repetition' ||
    input.metric === 'diversity' ||
    input.metric === 'intensity'
  ) {
    // Substance signals — always over the FULL enabled keyword set (corpus was
    // loaded with polarity 'both'), independent of the polarity filter, since
    // "quality of language" isn't a positive/counter question.
    for (const doc of filteredDocs) {
      let total = 0
      let unique = 0
      for (const kw of corpus.keywords) {
        const n = corpus.countFor(doc.id, kw.id)
        total += n
        if (n > 0) unique++
      }
      const signals = computeSubstanceSignals({
        totalMatches: total,
        uniqueKeywords: unique,
        enabledKeywords: corpus.keywords.length,
        wordCount: doc.wordCount,
      })
      const value =
        input.metric === 'repetition' ? signals.repetition
        : input.metric === 'diversity' ? signals.diversity
        : (signals.intensity ?? 0)
      const point = makePoint(doc, value)
      point.confidence = signals.confidence
      points.push(point)
    }
  } else if (input.metric === 'evidence-reuse') {
    // Evidence reuse across pillars: the share of a document's matches that
    // land on keywords tagged to MORE THAN ONE value of the keyword-attached
    // (pillar) axis — the same evidence counted toward several pillars. Uses
    // the keyword list's first declared keyword-attached axis as "pillars".
    // When no such axis exists (or no keyword is multi-tagged) the signal is
    // 0 for every document — there's no reuse to detect.
    const pillarAxes = await getKeywordListAxes(input.keywordListId)
    const pillarAxisId = pillarAxes[0]
    const multiPillar = new Set<string>()
    if (pillarAxisId) {
      const tagRows = await selectAll<{ keyword_id: string; value_id: string }>(
        'keywords.tagsForList',
        [input.keywordListId, pillarAxisId]
      )
      const tagCountByKw = new Map<string, number>()
      for (const r of tagRows) tagCountByKw.set(r.keyword_id, (tagCountByKw.get(r.keyword_id) ?? 0) + 1)
      for (const [kwId, n] of tagCountByKw) if (n > 1) multiPillar.add(kwId)
    }
    for (const doc of filteredDocs) {
      let total = 0
      let reuse = 0
      for (const kw of corpus.keywords) {
        const n = corpus.countFor(doc.id, kw.id)
        total += n
        if (multiPillar.has(kw.id)) reuse += n
      }
      const point = makePoint(doc, evidenceReuseRatio(reuse, total))
      point.confidence = substanceConfidence({
        totalMatches: total,
        uniqueKeywords: 0, // unused by confidence
        enabledKeywords: corpus.keywords.length,
        wordCount: doc.wordCount,
      })
      points.push(point)
    }
  } else if (input.metric === 'pos-minus-counter') {
    const positives = corpus.keywords.filter((k) => k.polarity === 'positive')
    const counters = corpus.keywords.filter((k) => k.polarity === 'counter')
    for (const doc of filteredDocs) {
      let pos = 0, neg = 0
      for (const kw of positives) pos += corpus.countFor(doc.id, kw.id)
      for (const kw of counters) neg += corpus.countFor(doc.id, kw.id)
      points.push(makePoint(doc, pos - neg, { positive: pos, counter: neg }))
    }
  } else if (input.metric === 'score' && input.scoringRule) {
    // The Score Evaluator owns the Wedding-Cake math + full/v1 mode decision.
    // Compare flattens each doc's Evaluation Trace into a bar breakdown.
    const evaluation = await evaluateScore({
      projectId: input.projectId,
      keywordListId: input.keywordListId,
      definition: input.scoringRule,
      polarity: 'positive',
    })
    scoreFallback = evaluation.mode === 'v1-prerequisite'
    for (const doc of filteredDocs) {
      const ds = evaluation.perDocument.get(doc.id)
      const breakdown: Record<string, number> = {}
      for (const step of ds?.trace ?? []) breakdown[step.label] = step.count
      points.push(makePoint(doc, ds?.score ?? 0, breakdown))
    }
  }

  // 4. Sort desc by value, then by title for stability.
  points.sort((a, b) => b.value - a.value || a.title.localeCompare(b.title))

  return {
    metric: input.metric,
    points,
    group: input.group,
    scoreFallback,
    excluded,
    keywordLabel,
  }
}

function makePoint(doc: Document, value: number, breakdown?: Record<string, number>): ComparePoint {
  return {
    documentId: doc.id,
    title: doc.title ?? doc.filename,
    year: doc.year,
    company: doc.company,
    sector: doc.sector,
    type: doc.type,
    companySize: doc.companySize,
    value,
    breakdown,
  }
}

