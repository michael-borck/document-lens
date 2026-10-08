/**
 * Prominence zones (ADR-0032) derived from layout-pass headings
 * (ADR-0040). Two positional zones, binary for now:
 *
 *   - **Leadership voice** — the VC/Chancellor statement or foreword:
 *     "the register the institution answers for".
 *   - **Body** — everywhere else, including KPI tables.
 *
 * The zone is positional, not semantic (embedding-classifying it was
 * rejected in ADR-0032): detection is a heading-text match against the
 * researchers' own fallback vocabulary, the first matching heading wins
 * ("on early pages"), and the zone runs to the next heading of equal or
 * higher rank — every stored heading, in this v1. Detection failure
 * defaults to Body and is visible, never guessed (ADR-0026); the manual
 * per-document override is part of the design and lands with the UI.
 */

import { listDocumentHeadings, type DocumentHeading } from './document-headings'
import { getDocument } from './documents'

export type ProminenceZone = 'leadership' | 'body'

export interface LeadershipZone {
  headingText: string
  /** Inclusive char offset of the heading in extracted_text. */
  startOffset: number
  /** Exclusive offset — the next heading, or end of document. */
  endOffset: number
}

/**
 * The researchers' fallback vocabulary (ADR-0032 decision text). Word-
 * boundary-ish: "Vice-Chancellor" anywhere in a heading qualifies, so
 * "Vice-Chancellor's introduction", "From the Vice-Chancellor", and
 * "Message from the Vice-Chancellor" all fire — while a plain
 * "Director's report" (Narrow Waters) correctly does not.
 */
const LEADERSHIP_HEADING_RE =
  /vice[- ]?chancellor|chancellor'?s?\s+(report|statement|foreword|message|introduction|letter)|from\s+the\s+(vice[- ]?)?chancellor/i

/**
 * Derive the Leadership-voice zone from stored headings. Returns null
 * when no heading matches the leadership vocabulary — the document is
 * then all Body (the ADR-0032 fallback), and callers surface the
 * non-detection rather than inventing a zone.
 */
export function detectLeadershipZone(
  headings: DocumentHeading[],
  totalTextLength: number
): LeadershipZone | null {
  const sorted = [...headings].sort((a, b) => a.startOffset - b.startOffset)
  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i]
    if (!LEADERSHIP_HEADING_RE.test(h.text)) continue
    const next = sorted[i + 1]
    return {
      headingText: h.text,
      startOffset: h.startOffset,
      endOffset: next ? next.startOffset : totalTextLength,
    }
  }
  return null
}

/** Which zone a mention's offset falls in. Outside a zone = Body. */
export function zoneForOffset(zone: LeadershipZone | null, offset: number): ProminenceZone {
  if (!zone) return 'body'
  return offset >= zone.startOffset && offset < zone.endOffset ? 'leadership' : 'body'
}

/**
 * Convenience: derive a document's effective Leadership zone. The manual
 * override (ADR-0032, `zoneOverride` on the document) wins when present;
 * otherwise the layout-pass headings are matched against the leadership
 * vocabulary. Null when neither exists — all-Body fallback, surfaced not
 * guessed.
 */
export async function getLeadershipZone(documentId: string): Promise<LeadershipZone | null> {
  const doc = await getDocument(documentId)
  if (!doc) return null
  if (doc.zoneOverride) {
    return {
      headingText: 'Manual override',
      startOffset: doc.zoneOverride.startOffset,
      endOffset: doc.zoneOverride.endOffset,
    }
  }
  const headings = await listDocumentHeadings(documentId)
  return detectLeadershipZone(headings, doc.extractedText?.length ?? 0)
}
