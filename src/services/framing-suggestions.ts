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
import { api, type FramingSuggestionResult } from './api'
import type { Document } from '@/types/data'

export const FRAMING_AXIS = 'framing'

/** Backend batch ceiling (schema allows ≤ 200 passages per request). */
const MODEL_BATCH_SIZE = 200

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
  /** Rung-0 (deterministic rule) suggestions created. */
  suggestionsCreated: number
  /** ClimateBERT (model) suggestions created; 0 when unavailable. */
  modelSuggestionsCreated: number
  /** True when the backend models were unreachable or not loaded. */
  modelUnavailable: boolean
}

/**
 * Re-run framing suggestions over every keyword mention in the project:
 * rung 0 first (deterministic Quantified/Limit rules), then the ML rung
 * (ClimateBERT Aspirational suggestions) when the backend offers it.
 * Idempotent per (document, keyword, span, axis, rule); dismissed or
 * accepted rows are never duplicated or resurrected.
 */
export async function regenerateFramingSuggestions(
  input: RegenerateFramingSuggestionsInput
): Promise<RegenerateResult> {
  const [posCorpus, cntCorpus] = await Promise.all([
    loadProjectCorpus({ projectId: input.projectId, keywordListId: input.keywordListId, polarity: 'positive' }),
    loadProjectCorpus({ projectId: input.projectId, keywordListId: input.keywordListId, polarity: 'counter' }),
  ])

  let created = 0
  let modelCreated = 0
  let modelUnavailable = false
  let done = 0
  const total = posCorpus.docs.length

  for (const doc of posCorpus.docs) {
    const { ops: rung0Ops } = await collectSuggestionsForDoc(doc, posCorpus, cntCorpus)
    if (rung0Ops.length > 0) {
      await runBatch(rung0Ops)
      created += rung0Ops.filter((op) => op.key === 'mentionSuggestions.create').length
    }

    // ML rung: only where rung 0 stayed silent — a model Aspirational chip
    // next to a deterministic Quantified chip on the same span is noise,
    // not enrichment (the human already has the stronger claim there).
    const { ops: modelOps, unavailable } = await collectModelSuggestionsForDoc(
      doc,
      posCorpus,
      cntCorpus
    )
    modelUnavailable = modelUnavailable || unavailable
    if (modelOps.length > 0) {
      await runBatch(modelOps)
      modelCreated += modelOps.filter((op) => op.key === 'mentionSuggestions.create').length
    }

    done++
    input.onProgress?.(done, total)
  }

  return {
    documentsScanned: total,
    suggestionsCreated: created,
    modelSuggestionsCreated: modelCreated,
    modelUnavailable,
  }
}

interface SpanInfo {
  keywordId: string
  start: number
  end: number
  passage: string
}

/** Every keyword-mention span in the document, with its sentence window. */
function collectSpans(doc: Document, corpora: ProjectCorpus[]): SpanInfo[] {
  const text = doc.extractedText ?? ''
  if (!text) return []
  const out: SpanInfo[] = []
  for (const corpus of corpora) {
    for (const kw of corpus.keywords) {
      for (const span of corpus.spansFor(doc.id, kw.id)) {
        const bounds = sentenceWindowBounds(text, span.start, span.end)
        out.push({
          keywordId: kw.id,
          start: span.start,
          end: span.end,
          passage: text.slice(bounds.start, bounds.end),
        })
      }
    }
  }
  return out
}

async function collectSuggestionsForDoc(
  doc: Document,
  posCorpus: ProjectCorpus,
  cntCorpus: ProjectCorpus
): Promise<{ ops: Array<{ key: string; params: unknown[] }> }> {
  const text = doc.extractedText ?? ''
  const ops: Array<{ key: string; params: unknown[] }> = []
  if (!text) return { ops }

  // Existing (span, axis, rule) keys — any status. A dismissed or accepted
  // suggestion blocks regeneration from recreating it (INSERT OR IGNORE is
  // the backstop; skipping here keeps the "created" count honest).
  const existingRows = await selectAll<SuggestionRow>('mentionSuggestions.byDocument', [doc.id])
  const existing = new Set(
    existingRows.map((r) => `${r.start_offset}|${r.axis}|${r.rule}`)
  )

  const timestamp = now()
  for (const info of collectSpans(doc, [posCorpus, cntCorpus])) {
    const hit = detectFraming(info.passage)
    if (!hit) continue
    if (existing.has(`${info.start}|${FRAMING_AXIS}|${hit.rule}`)) continue
    ops.push({
      key: 'mentionSuggestions.create',
      params: [
        newId(),
        doc.id,
        info.keywordId,
        info.start,
        info.end,
        FRAMING_AXIS,
        hit.value,
        hit.rule,
        null, // deterministic — no confidence score
        timestamp,
      ],
    })
  }
  return { ops }
}

async function collectModelSuggestionsForDoc(
  doc: Document,
  posCorpus: ProjectCorpus,
  cntCorpus: ProjectCorpus
): Promise<{ ops: Array<{ key: string; params: unknown[] }>; unavailable: boolean }> {
  const ops: Array<{ key: string; params: unknown[] }> = []
  const spans = collectSpans(doc, [posCorpus, cntCorpus])
  if (spans.length === 0) return { ops, unavailable: false }

  const existingRows = await selectAll<SuggestionRow>('mentionSuggestions.byDocument', [doc.id])
  const existing = new Set(
    existingRows.map((r) => `${r.start_offset}|${r.axis}|${r.rule}`)
  )
  // Spans that already carry an ACTIVE suggestion (rung 0 fired, or a
  // model suggestion exists) — a second chip on the same passage is
  // noise, not enrichment; the human already has something to judge.
  const hasActiveSuggestion = new Set(
    existingRows.filter((r) => r.status !== 'dismissed').map((r) => `${r.start_offset}`)
  )

  const timestamp = now()
  let unavailable = false

  for (let i = 0; i < spans.length; i += MODEL_BATCH_SIZE) {
    const chunk = spans.slice(i, i + MODEL_BATCH_SIZE)
    let response: Awaited<ReturnType<typeof api.framingSuggest>>
    try {
      response = await api.framingSuggest(chunk.map((s) => s.passage))
    } catch {
      // Backend unreachable / endpoint missing — degrade to rung 0 silently.
      return { ops, unavailable: true }
    }
    if (!response.available) {
      unavailable = true
      continue
    }

    response.results.forEach((result: FramingSuggestionResult | null, j: number) => {
      const info = chunk[j]
      if (!result || result.framing_value !== '1') return
      // Skip where the human already has a suggestion to judge.
      if (hasActiveSuggestion.has(`${info.start}`)) return
      const rule = result.model_revision ?? 'climatebert'
      if (existing.has(`${info.start}|${FRAMING_AXIS}|${rule}`)) return
      ops.push({
        key: 'mentionSuggestions.create',
        params: [
          newId(),
          doc.id,
          info.keywordId,
          info.start,
          info.end,
          FRAMING_AXIS,
          '1',
          rule,
          result.target_score,
          timestamp,
        ],
      })
    })
  }
  return { ops, unavailable }
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
