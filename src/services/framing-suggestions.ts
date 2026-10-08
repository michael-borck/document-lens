/**
 * Framing suggestions (ADR-0039) — flagged, never recorded.
 *
 * The rung-0 engine here is the deterministic framing rules
 * (`_shared/framing-rules.ts`): obvious Quantified (direction + number +
 * date) and Limit (boundary that binds) passages get a suggestion, which
 * renders as a flagged chip the researcher confirms or dismisses.
 *
 * Contracts that make this safe inside the methodology:
 *   - Accepting writes the human's row into mention_annotations with
 *     `source: 'rule-suggested-accepted'` and the rule id as provenance —
 *     the recorded value is still the accepted one.
 *   - Dismissing keeps the suggestion row (status='dismissed') so the
 *     same rule never resurfaces for the same span.
 *   - Regeneration is idempotent per (document, keyword, span, axis,
 *     rule): existing rows (any status) are never duplicated or
 *     resurrected.
 *   - Batch-accept is deliberately absent (ADR-0039 consequence: near-
 *     100% accept-rate is a smell, not a success).
 */

import { selectAll, selectOne, runStatement, runBatch, newId, now } from './db'
import { loadProjectCorpus, type ProjectCorpus } from './_shared/project-corpus'
import { sentenceWindowBounds } from './_shared/keyword-match'
import { detectFraming, type FramingValue } from './_shared/framing-rules'
import { setAnnotation } from './mention-annotations'
import type { Document } from '@/types/data'

export const FRAMING_AXIS = 'framing'

export interface MentionSuggestion {
  id: string
  documentId: string
  keywordId: string
  startOffset: number
  endOffset: number
  axis: string
  value: FramingValue | string
  /** Stable rule id (rung 0) or model@revision (ML rung). */
  rule: string
  score: number | null
  status: 'open' | 'accepted' | 'dismissed'
  createdAt: string
}

interface SuggestionRow {
  id: string
  document_id: string
  keyword_id: string
  start_offset: number
  end_offset: number
  axis: string
  value: string
  rule: string
  score: number | null
  status: MentionSuggestion['status']
  created_at: string
}

function rowToSuggestion(row: SuggestionRow): MentionSuggestion {
  return {
    id: row.id,
    documentId: row.document_id,
    keywordId: row.keyword_id,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    axis: row.axis,
    value: row.value,
    rule: row.rule,
    score: row.score,
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function listSuggestionsForDocument(documentId: string): Promise<MentionSuggestion[]> {
  const rows = await selectAll<SuggestionRow>('mentionSuggestions.byDocument', [documentId])
  return rows.map(rowToSuggestion)
}

export interface RegenerateFramingSuggestionsInput {
  projectId: string
  keywordListId: string
  /** Called with progress counts for long corpora. */
  onProgress?: (done: number, total: number) => void
}

export interface RegenerateResult {
  documentsScanned: number
  suggestionsCreated: number
}

/**
 * Re-run the rung-0 framing rules over every keyword mention in the
 * project. Idempotent: only NEW (span, rule) pairs are inserted; dismissed
 * or accepted rows are left exactly as the researcher left them.
 */
export async function regenerateFramingSuggestions(
  input: RegenerateFramingSuggestionsInput
): Promise<RegenerateResult> {
  const [posCorpus, cntCorpus] = await Promise.all([
    loadProjectCorpus({ projectId: input.projectId, keywordListId: input.keywordListId, polarity: 'positive' }),
    loadProjectCorpus({ projectId: input.projectId, keywordListId: input.keywordListId, polarity: 'counter' }),
  ])

  let created = 0
  let done = 0
  const total = posCorpus.docs.length

  for (const doc of posCorpus.docs) {
    const ops = await collectSuggestionsForDoc(doc, posCorpus, cntCorpus)
    if (ops.length > 0) {
      await runBatch(ops)
      created += ops.filter((op) => op.key === 'mentionSuggestions.create').length
    }
    done++
    input.onProgress?.(done, total)
  }

  return { documentsScanned: total, suggestionsCreated: created }
}

async function collectSuggestionsForDoc(
  doc: Document,
  posCorpus: ProjectCorpus,
  cntCorpus: ProjectCorpus
): Promise<Array<{ key: string; params: unknown[] }>> {
  const text = doc.extractedText ?? ''
  if (!text) return []

  // Existing (span, axis, rule) keys — any status. A dismissed or accepted
  // suggestion blocks regeneration from recreating it (INSERT OR IGNORE is
  // the backstop; skipping here keeps the "created" count honest).
  const existingRows = await selectAll<SuggestionRow>('mentionSuggestions.byDocument', [doc.id])
  const existing = new Set(
    existingRows.map((r) => `${r.start_offset}|${r.axis}|${r.rule}`)
  )

  const ops: Array<{ key: string; params: unknown[] }> = []
  const timestamp = now()

  for (const corpus of [posCorpus, cntCorpus]) {
    for (const kw of corpus.keywords) {
      for (const span of corpus.spansFor(doc.id, kw.id)) {
        const bounds = sentenceWindowBounds(text, span.start, span.end)
        const passage = text.slice(bounds.start, bounds.end)
        const hit = detectFraming(passage)
        if (!hit) continue
        if (existing.has(`${span.start}|${FRAMING_AXIS}|${hit.rule}`)) continue
        ops.push({
          key: 'mentionSuggestions.create',
          params: [
            newId(),
            doc.id,
            kw.id,
            span.start,
            span.end,
            FRAMING_AXIS,
            hit.value,
            hit.rule,
            null, // deterministic — no confidence score
            timestamp,
          ],
        })
      }
    }
  }
  return ops
}

/**
 * Accept a suggestion: records the human's accepted value in the
 * annotation store with rule provenance, marks the suggestion accepted.
 * The suggestion row is kept — provenance of the decision, and the
 * calibration hook's accept-rate denominator.
 */
export async function acceptSuggestion(suggestionId: string): Promise<void> {
  const row = await selectOne<SuggestionRow>('mentionSuggestions.getById', [suggestionId])
  if (!row) throw new Error(`Suggestion ${suggestionId} not found`)
  await setAnnotation({
    documentId: row.document_id,
    keywordId: row.keyword_id,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    axis: row.axis,
    value: row.value,
    source: 'rule-suggested-accepted',
    suggestedBy: row.rule,
    suggestionScore: row.score ?? undefined,
  })
  await runStatement('mentionSuggestions.setStatus', ['accepted', suggestionId])
}

/** Dismiss — kept forever, never resurfaces for the same span + rule. */
export async function dismissSuggestion(suggestionId: string): Promise<void> {
  await runStatement('mentionSuggestions.setStatus', ['dismissed', suggestionId])
}
