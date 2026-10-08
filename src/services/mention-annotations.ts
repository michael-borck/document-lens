/**
 * Per-mention human annotations (ADR-0038) — the one new primitive the
 * legend-as-data decision commits to.
 *
 * Researchers record codes (Framing 0–3, Prominence Leadership/Body,
 * Provenance Mandated/Voluntary today; the axis set is open) against a
 * specific keyword hit in a document. The recorded `value` is always the
 * human's accepted code. An ML/AI suggestion can seed a row, but then it
 * is stored as provenance (`source: 'ai-suggested-accepted'` +
 * `suggestedBy`/`suggestionScore`) — the value itself is what the human
 * accepted (ADR-0035: the tool suggests; the researcher judges).
 *
 * One row per (document, keyword, span start, axis): a mention may carry
 * several axes, but only one accepted value per axis. setAnnotation
 * upserts on that key.
 */

import { selectAll, selectOne, runStatement, runBatch, newId, now } from './db'

export interface MentionAnnotation {
  id: string
  documentId: string
  keywordId: string
  startOffset: number
  endOffset: number
  /** Open set — 'framing' | 'prominence' | 'provenance' today. */
  axis: string
  /** The recorded (human-accepted) code, e.g. '0'–'3', 'leadership', 'mandated'. */
  value: string
  source: AnnotationSource
  /** Model id + revision when source = 'ai-suggested-accepted'. */
  suggestedBy: string | null
  suggestionScore: number | null
  notedAt: string
}

export type AnnotationSource = 'human' | 'ai-suggested-accepted'

/** The v9 legend's axes, as a convenience — the store itself is open-set. */
export const ANNOTATION_AXES = ['framing', 'prominence', 'provenance'] as const

interface AnnotationRow {
  id: string
  document_id: string
  keyword_id: string
  start_offset: number
  end_offset: number
  axis: string
  value: string
  source: AnnotationSource
  suggested_by: string | null
  suggestion_score: number | null
  noted_at: string
}

function rowToAnnotation(row: AnnotationRow): MentionAnnotation {
  return {
    id: row.id,
    documentId: row.document_id,
    keywordId: row.keyword_id,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    axis: row.axis,
    value: row.value,
    source: row.source,
    suggestedBy: row.suggested_by,
    suggestionScore: row.suggestion_score,
    notedAt: row.noted_at,
  }
}

export async function listAnnotationsForDocument(
  documentId: string
): Promise<MentionAnnotation[]> {
  const rows = await selectAll<AnnotationRow>('mentionAnnotations.listByDocument', [documentId])
  return rows.map(rowToAnnotation)
}

export interface SetAnnotationInput {
  documentId: string
  keywordId: string
  startOffset: number
  endOffset: number
  axis: string
  value: string
  source?: AnnotationSource
  /** Model id + revision; required when source is 'ai-suggested-accepted'. */
  suggestedBy?: string
  suggestionScore?: number
}

/**
 * Record (or overwrite) the accepted code for one mention on one axis.
 * Upsert on (document, keyword, start, axis): clear-then-insert in one
 * transaction so a crash can't leave two rows for the same key.
 */
export async function setAnnotation(input: SetAnnotationInput): Promise<MentionAnnotation> {
  const source = input.source ?? 'human'
  if (source === 'ai-suggested-accepted' && !input.suggestedBy) {
    throw new Error('ai-suggested-accepted annotations require suggestedBy (model id + revision)')
  }
  const id = newId()
  await runBatch([
    {
      key: 'mentionAnnotations.deleteForSpan',
      params: [input.documentId, input.keywordId, input.startOffset, input.axis],
    },
    {
      key: 'mentionAnnotations.create',
      params: [
        id,
        input.documentId,
        input.keywordId,
        input.startOffset,
        input.endOffset,
        input.axis,
        input.value,
        source,
        input.suggestedBy ?? null,
        input.suggestionScore ?? null,
        now(),
      ],
    },
  ])
  const row = await selectOne<AnnotationRow>('mentionAnnotations.getById', [id])
  if (!row) throw new Error('Failed to record annotation')
  return rowToAnnotation(row)
}

export async function deleteAnnotation(id: string): Promise<void> {
  await runStatement('mentionAnnotations.deleteById', [id])
}
