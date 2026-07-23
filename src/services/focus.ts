/**
 * Focus mode — deterministic "notability" ranking.
 *
 * Brute-forces the deterministic signals over the project's documents and ranks
 * them by how far each DEVIATES from the corpus (a confidence-weighted sum of
 * per-signal z-scores). The point is to give the researcher direction — "look
 * at these documents first, for these reasons" — without them having to stumble
 * onto the interesting one. It never renders every permutation; it ranks and
 * surfaces the extremes.
 *
 * Fully deterministic and reproducible: the same corpus + config always yields
 * the same ranking. The optional AI narration (a separate, flagged layer) reads
 * this same output — see docs/design/focus-auto-research-mode.md and ADR-0012.
 */

import { computeCompare, type CompareMetric } from './compare'
import { evaluateScore } from './scoring'
import { selectAll } from './db'
import { rowToDocument, type DocumentRow } from './_shared/document-row'
import type { ScoringRule } from '@/types/data'

/**
 * The signals we rank on. z-scoring normalises across their different scales.
 *
 * Each carries a plain-English gloss (`plain` / `meansHigh` / `meansLow`)
 * alongside the terse chip wording, so the interface can explain a finding to
 * a researcher who has never read this file. One source of truth: the UI
 * glossary, tooltips and any exported report all read these strings.
 */
export interface SignalDef {
  key: string
  label: string
  highWord: string
  lowWord: string
  /** What the signal measures, in one sentence, no statistics vocabulary. */
  plain: string
  /** What a document at the top of this signal is probably doing. */
  meansHigh: string
  /** What a document at the bottom of this signal is probably doing. */
  meansLow: string
}
export const SIGNALS: SignalDef[] = [
  {
    key: 'score',
    label: 'Pillar coverage',
    highWord: 'unusually high pillar coverage',
    lowWord: 'unusually low pillar coverage',
    plain: 'How much of the scoring framework the document actually satisfies — the share of pillar-and-function combinations it delivers on.',
    meansHigh: 'It addresses most of the framework rather than a corner of it.',
    meansLow: 'It speaks to only a small part of the framework.',
  },
  {
    key: 'repetition',
    label: 'Repetition',
    highWord: 'unusually repetitive language',
    lowWord: 'unusually varied language',
    plain: 'How many times, on average, the document repeats each term it uses — whether it keeps returning to the same few words or draws on a wider vocabulary.',
    meansHigh: 'It says the same things over and over: loud, but possibly thin behind the volume.',
    meansLow: 'It spreads its language across many different terms rather than hammering a few.',
  },
  {
    key: 'diversity',
    label: 'Diversity',
    highWord: 'unusually broad keyword coverage',
    lowWord: 'unusually narrow keyword coverage',
    plain: 'How much of your keyword list the document touches at all, regardless of how often.',
    meansHigh: 'It ranges across most of the topics you are looking for.',
    meansLow: 'It sticks to a narrow slice of the topics and ignores the rest.',
  },
  {
    key: 'intensity',
    label: 'Intensity',
    highWord: 'unusually intense (matches/word)',
    lowWord: 'unusually sparse (matches/word)',
    plain: 'How densely the topic appears once length is allowed for, so a long report cannot look more committed simply by being long.',
    meansHigh: 'The topic runs throughout the document rather than sitting in one section.',
    meansLow: 'The topic is a passing mention inside a much larger document.',
  },
  {
    key: 'evidence-reuse',
    label: 'Evidence reuse',
    highWord: 'unusually high evidence reuse',
    lowWord: 'unusually low evidence reuse',
    plain: 'How much the document counts the same evidence toward several pillars at once — one initiative ticking many boxes.',
    meansHigh: 'Its breadth may be thinner than it looks: the same work is claimed in several places.',
    meansLow: 'It brings distinct evidence for each area rather than recycling one initiative.',
  },
  {
    key: 'coverage-spread',
    label: 'Coverage spread',
    highWord: 'unusually broad matrix fill',
    lowWord: 'unusually concentrated matrix',
    plain: 'How much of the pillar-by-function grid the document fills in — how many combinations it says anything about.',
    meansHigh: 'It says something about nearly every combination.',
    meansLow: 'It goes deep in a few places and is silent everywhere else.',
  },
]

// --- Pure statistics (unit-tested) -----------------------------------------

/** Population mean + standard deviation. Empty → {0,0}. */
export function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, std: Math.sqrt(variance) }
}

/** z-score; 0 when there's no spread (std 0) so a flat signal contributes nothing. */
export function zScore(value: number, mean: number, std: number): number {
  return std > 0 ? (value - mean) / std : 0
}

/**
 * Aggregate a document's notability from its per-signal z-scores and its
 * evidence confidence. Sum of |z| captures a document extreme on several
 * dimensions; multiplying by confidence discounts extremes built on thin
 * evidence so the ranking is trustworthy.
 */
export function aggregateNotability(zs: number[], confidence: number): number {
  const sumAbs = zs.reduce((a, z) => a + Math.abs(z), 0)
  return sumAbs * confidence
}

// --- Result shape ----------------------------------------------------------

export interface FocusSignalHit {
  signal: string
  label: string
  z: number
  direction: 'high' | 'low'
  reason: string
}
export interface FocusDoc {
  documentId: string
  title: string
  year: number | null
  company: string | null
  notability: number
  confidence: number
  hits: FocusSignalHit[]
}
export interface FocusExtreme {
  signal: string
  label: string
  highDocId: string | null
  highTitle: string | null
  highValue: number | null
  lowDocId: string | null
  lowTitle: string | null
  lowValue: number | null
}
export interface FocusResult {
  documents: FocusDoc[]
  extremes: FocusExtreme[]
  corpusSize: number
  /** How signals were normalised — echoes the request, for display + provenance. */
  stratify: 'year' | 'corpus'
  /**
   * Documents that asked for within-year comparison but fell back to
   * whole-corpus stats, because their year cohort was too small (or their year
   * is unknown). Surfaced so a thin year isn't silently compared differently.
   */
  fellBackToCorpus: number
}

export interface FocusInput {
  projectId: string
  keywordListId: string
  scoringRule: ScoringRule | null
  /**
   * How a document's signals are normalised.
   *
   * 'year' (default) compares each document against others from the SAME year.
   * A corpus spanning years is a panel, and disclosure norms drift over time —
   * pooling every year would rank early documents as notable purely for being
   * early, rediscovering the calendar instead of anything about the
   * organisations. 'corpus' pools everything (the pre-stratification
   * behaviour), which is right for a single-year corpus.
   */
  stratify?: 'year' | 'corpus'
  /** Inclusive year bounds; documents outside them are excluded entirely. */
  yearMin?: number
  yearMax?: number
}

/** A document is called out on a signal when it's at least this many σ from the mean. */
const HIT_THRESHOLD = 1.0

/**
 * A year cohort needs at least this many documents carrying a signal before we
 * z-score against it. Below this the mean and σ are too unstable to be
 * meaningful — and a cohort of one has σ = 0, which would silently zero that
 * document's notability. Small cohorts fall back to the whole-corpus stats.
 */
const MIN_COHORT_SIZE = 4

export async function computeFocus(input: FocusInput): Promise<FocusResult> {
  const stratify = input.stratify ?? 'year'
  const allDocs = (await selectAll<DocumentRow>('documents.byProjectOrdered', [input.projectId])).map(rowToDocument)
  const docs = allDocs.filter((d) => {
    if (input.yearMin !== undefined && (d.year === null || d.year < input.yearMin)) return false
    if (input.yearMax !== undefined && (d.year === null || d.year > input.yearMax)) return false
    return true
  })
  const titleOf = (id: string) => {
    const d = docs.find((x) => x.id === id)
    return d ? (d.title ?? d.filename) : id
  }

  // Gather per-document signal values (null = unavailable for that doc).
  const values = new Map<string, Record<string, number | null>>()
  const confidenceByDoc = new Map<string, number>()
  for (const d of docs) values.set(d.id, {})

  const metrics: CompareMetric[] = ['repetition', 'diversity', 'intensity', 'evidence-reuse', 'coverage-spread']
  for (const metric of metrics) {
    const result = await computeCompare({
      projectId: input.projectId,
      keywordListId: input.keywordListId,
      metric,
      polarity: 'positive',
      group: 'none',
      yearMin: input.yearMin,
      yearMax: input.yearMax,
      scoringRule: input.scoringRule?.definition,
    })
    for (const p of result.points) {
      const rec = values.get(p.documentId)
      if (rec) rec[metric] = p.value
      if (p.confidence !== undefined) confidenceByDoc.set(p.documentId, p.confidence)
    }
  }
  if (input.scoringRule) {
    try {
      const ev = await evaluateScore({ projectId: input.projectId, keywordListId: input.keywordListId, definition: input.scoringRule.definition, polarity: 'positive' })
      for (const [id, s] of ev.perDocument) {
        const rec = values.get(id)
        if (rec) rec['score'] = s.overallRatio ?? null
      }
    } catch { /* scoring not computable — the 'score' signal is simply absent */ }
  }

  // Per-signal statistics over the whole (filtered) corpus. Always computed:
  // it's the baseline for 'corpus' mode and the fallback for thin year cohorts.
  const valuesFor = (sig: string, pool: typeof docs) =>
    pool
      .map((d) => values.get(d.id)?.[sig])
      .filter((v): v is number => v !== undefined && v !== null)

  const stats = new Map<string, { mean: number; std: number }>()
  for (const sig of SIGNALS) stats.set(sig.key, meanStd(valuesFor(sig.key, docs)))

  // Per-(year, signal) statistics, so each document is compared with its own
  // cohort rather than across a decade of shifting disclosure norms.
  const byYear = new Map<number, typeof docs>()
  for (const d of docs) {
    if (d.year === null) continue
    const cohort = byYear.get(d.year)
    if (cohort) cohort.push(d)
    else byYear.set(d.year, [d])
  }
  const yearStats = new Map<string, { mean: number; std: number }>()
  const yearCohortSize = new Map<string, number>()
  if (stratify === 'year') {
    for (const [year, cohort] of byYear) {
      for (const sig of SIGNALS) {
        const vs = valuesFor(sig.key, cohort)
        yearStats.set(`${year} ${sig.key}`, meanStd(vs))
        yearCohortSize.set(`${year} ${sig.key}`, vs.length)
      }
    }
  }

  /**
   * The stats a document is judged against: its year cohort when that cohort is
   * big enough, otherwise the whole corpus. Returns whether it fell back so the
   * caller can report it rather than quietly mixing two bases.
   */
  const statsFor = (sig: string, year: number | null) => {
    if (stratify === 'year' && year !== null) {
      const key = `${year} ${sig}`
      if ((yearCohortSize.get(key) ?? 0) >= MIN_COHORT_SIZE) {
        return { stats: yearStats.get(key)!, fellBack: false }
      }
    }
    return { stats: stats.get(sig)!, fellBack: stratify === 'year' }
  }

  // Per-document notability + "why".
  let fellBackToCorpus = 0
  const focusDocs: FocusDoc[] = docs.map((d) => {
    const rec = values.get(d.id) ?? {}
    const confidence = confidenceByDoc.get(d.id) ?? 0
    const zs: number[] = []
    const hits: FocusSignalHit[] = []
    let docFellBack = false
    for (const sig of SIGNALS) {
      const v = rec[sig.key]
      if (v === undefined || v === null) continue
      const { stats: basis, fellBack } = statsFor(sig.key, d.year)
      if (fellBack) docFellBack = true
      const { mean, std } = basis
      const z = zScore(v, mean, std)
      zs.push(z)
      if (Math.abs(z) >= HIT_THRESHOLD) {
        hits.push({
          signal: sig.key,
          label: sig.label,
          z,
          direction: z > 0 ? 'high' : 'low',
          reason: z > 0 ? sig.highWord : sig.lowWord,
        })
      }
    }
    hits.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    if (docFellBack) fellBackToCorpus++
    return {
      documentId: d.id,
      title: d.title ?? d.filename,
      year: d.year,
      company: d.company,
      notability: aggregateNotability(zs, confidence),
      confidence,
      hits: hits.slice(0, 3),
    }
  })
  focusDocs.sort((a, b) => b.notability - a.notability)

  // Per-signal extremes (highest / lowest document on each signal).
  const extremes: FocusExtreme[] = SIGNALS.map((sig) => {
    let hi: { id: string; v: number } | null = null
    let lo: { id: string; v: number } | null = null
    for (const d of docs) {
      const v = values.get(d.id)?.[sig.key]
      if (v === undefined || v === null) continue
      if (!hi || v > hi.v) hi = { id: d.id, v }
      if (!lo || v < lo.v) lo = { id: d.id, v }
    }
    return {
      signal: sig.key,
      label: sig.label,
      highDocId: hi?.id ?? null,
      highTitle: hi ? titleOf(hi.id) : null,
      highValue: hi?.v ?? null,
      lowDocId: lo?.id ?? null,
      lowTitle: lo ? titleOf(lo.id) : null,
      lowValue: lo?.v ?? null,
    }
  })

  return { documents: focusDocs, extremes, corpusSize: docs.length, stratify, fellBackToCorpus }
}
