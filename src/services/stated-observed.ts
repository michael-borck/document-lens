/**
 * Stated vs Observed — the document-level divergence signal behind the
 * researchers' Delivery tab.
 *
 *   - **Stated** — environmental SDG avowal: positive-keyword mentions.
 *   - **Observed** — countervailing activity: counter-keyword mentions
 *     (the unambiguous-transgression lists — oil, coal, LNG, clearing).
 *
 * Both are split by prominence band (Leadership voice / Body, ADR-0032).
 * The researchers' resolution rule: when stated and observed concentrate
 * in DIFFERENT bands, the say-do gap is auto-resolved — divergence; when
 * they share a band, the co-location is flagged for human reading
 * ("necessary, not sufficient" — the wording is deliberately neutral:
 * Stated vs Observed, never "Says vs Does").
 *
 * Outcome per document is one of:
 *   'divergent'        — bands differ: say-do gap, auto-resolved
 *   'co-located'       — same band: flagged for human reading
 *   'no-countervailing'— avowal with no observed transgression
 *   'no-stated'        — transgression language with no avowal
 *   'undetermined'     — no Leadership zone detected (all-Body fallback
 *                        makes band comparison meaningless)
 */

import { listDocumentHeadings } from './document-headings'
import { detectLeadershipZone, zoneForOffset, type LeadershipZone } from './prominence'
import { loadProjectCorpus, type ProjectCorpus } from './_shared/project-corpus'

export type StatedObservedOutcome =
  | 'divergent'
  | 'co-located'
  | 'no-countervailing'
  | 'no-stated'
  | 'undetermined'

export interface StatedObservedDoc {
  documentId: string
  label: string
  year: number | null
  zoneDetected: boolean
  /** Positive-keyword mentions per band (Stated). */
  statedLeadership: number
  statedBody: number
  /** Counter-keyword mentions per band (Observed). */
  observedLeadership: number
  observedBody: number
  outcome: StatedObservedOutcome
}

export interface ComputeStatedObservedInput {
  projectId: string
  keywordListId: string
}

export interface StatedObservedResult {
  documents: StatedObservedDoc[]
}

export async function computeStatedObserved(
  input: ComputeStatedObservedInput
): Promise<StatedObservedResult> {
  const [posCorpus, cntCorpus] = await Promise.all([
    loadProjectCorpus({ projectId: input.projectId, keywordListId: input.keywordListId, polarity: 'positive' }),
    loadProjectCorpus({ projectId: input.projectId, keywordListId: input.keywordListId, polarity: 'counter' }),
  ])

  const documents: StatedObservedDoc[] = []
  for (const doc of posCorpus.docs) {
    const headings = await listDocumentHeadings(doc.id)
    const textLength = doc.extractedText?.length ?? 0
    const zone: LeadershipZone | null = detectLeadershipZone(headings, textLength)

    const stated = countByBand(posCorpus, doc.id, zone)
    const observed = countByBand(cntCorpus, doc.id, zone)

    documents.push({
      documentId: doc.id,
      label: doc.company || doc.title || doc.filename,
      year: doc.year,
      zoneDetected: zone !== null,
      statedLeadership: stated.leadership,
      statedBody: stated.body,
      observedLeadership: observed.leadership,
      observedBody: observed.body,
      outcome: resolveOutcome(stated, observed, zone !== null),
    })
  }

  return { documents }
}

function countByBand(
  corpus: ProjectCorpus,
  documentId: string,
  zone: LeadershipZone | null
): { leadership: number; body: number } {
  let leadership = 0
  let body = 0
  for (const kw of corpus.keywords) {
    for (const span of corpus.spansFor(documentId, kw.id)) {
      if (zoneForOffset(zone, span.start) === 'leadership') leadership++
      else body++
    }
  }
  return { leadership, body }
}

function resolveOutcome(
  stated: { leadership: number; body: number },
  observed: { leadership: number; body: number },
  zoneDetected: boolean
): StatedObservedOutcome {
  const statedTotal = stated.leadership + stated.body
  const observedTotal = observed.leadership + observed.body
  if (statedTotal === 0) return 'no-stated'
  if (observedTotal === 0) return 'no-countervailing'
  if (!zoneDetected) return 'undetermined'
  // Majority band, ties fall to Body (Leadership voice must be earned).
  const statedBand = stated.leadership > stated.body ? 'leadership' : 'body'
  const observedBand = observed.leadership > observed.body ? 'leadership' : 'body'
  return statedBand === observedBand ? 'co-located' : 'divergent'
}
