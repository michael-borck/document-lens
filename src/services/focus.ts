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

/** The signals we rank on. z-scoring normalises across their different scales. */
interface SignalDef {
  key: string
  label: string
  highWord: string
  lowWord: string
}
const SIGNALS: SignalDef[] = [
  { key: 'score', label: 'Pillar coverage', highWord: 'unusually high pillar coverage', lowWord: 'unusually low pillar coverage' },
  { key: 'repetition', label: 'Repetition', highWord: 'unusually repetitive language', lowWord: 'unusually varied language' },
  { key: 'diversity', label: 'Diversity', highWord: 'unusually broad keyword coverage', lowWord: 'unusually narrow keyword coverage' },
  { key: 'intensity', label: 'Intensity', highWord: 'unusually intense (matches/word)', lowWord: 'unusually sparse (matches/word)' },
  { key: 'evidence-reuse', label: 'Evidence reuse', highWord: 'unusually high evidence reuse', lowWord: 'unusually low evidence reuse' },
  { key: 'coverage-spread', label: 'Coverage spread', highWord: 'unusually broad matrix fill', lowWord: 'unusually concentrated matrix' },
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
}

export interface FocusInput {
  projectId: string
  keywordListId: string
  scoringRule: ScoringRule | null
}

/** A document is called out on a signal when it's at least this many σ from the mean. */
const HIT_THRESHOLD = 1.0

export async function computeFocus(input: FocusInput): Promise<FocusResult> {
  const docs = (await selectAll<DocumentRow>('documents.byProjectOrdered', [input.projectId])).map(rowToDocument)
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

  // Per-signal corpus statistics (over documents that have the value).
  const stats = new Map<string, { mean: number; std: number }>()
  for (const sig of SIGNALS) {
    const vs = docs
      .map((d) => values.get(d.id)?.[sig.key])
      .filter((v): v is number => v !== undefined && v !== null)
    stats.set(sig.key, meanStd(vs))
  }

  // Per-document notability + "why".
  const focusDocs: FocusDoc[] = docs.map((d) => {
    const rec = values.get(d.id) ?? {}
    const confidence = confidenceByDoc.get(d.id) ?? 0
    const zs: number[] = []
    const hits: FocusSignalHit[] = []
    for (const sig of SIGNALS) {
      const v = rec[sig.key]
      if (v === undefined || v === null) continue
      const { mean, std } = stats.get(sig.key)!
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

  return { documents: focusDocs, extremes, corpusSize: docs.length }
}
