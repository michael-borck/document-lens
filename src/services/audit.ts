/**
 * Audit workflow — two modes, one shape.
 *
 * Anomalies (US-F-01, US-F-02): wires /semantic/structural-mismatch.
 * For each project document, the backend returns sentences whose own
 * semantic-domain assignment differs from their parent section's; we
 * surface keyword-bearing dislocations.
 *
 * Confirmations (US-F-03): no backend call — uses cached classifications
 * from Phase 3.5. For each section already tagged with a Function value
 * via section_lens_tags, scan the section text for keyword matches and
 * surface each as a "confirmed in {domain}" finding. Severity maps to
 * the section's classification confidence.
 *
 * The methodology calls this pair the "contextual relevance check":
 * Anomalies catches mis-categorised disclosure or false-positive
 * keyword detection; Confirmations gives the researcher the defensible
 * "yes, this keyword IS being used in the right context" view to show
 * a sceptical reviewer.
 */

import { selectAll, selectOne, runStatement, now } from './db'
import { listKeywords } from './keyword-lists'
import { listLensValues, getLens } from './lenses'
import { listSections, getSectionTagsForDocument } from './sections'
import { api, type StructuralMismatchResponse } from './api'
import type {
  KeywordPolarity,
  LensValue,
} from '@/types/data'

export type AuditMode = 'anomalies' | 'confirmations'

export interface AuditFinding {
  /** Distinguishes anomaly (off-context) vs confirmation (in-context) findings. */
  mode: AuditMode
  documentId: string
  documentTitle: string
  documentYear: number | null
  keyword: string
  keywordPolarity: KeywordPolarity
  /** Quoted snippet — the dislocated sentence (anomaly) or a window
   *  around the keyword match in its section (confirmation). */
  sentenceText: string
  /** The section's classified domain (Function value). */
  sectionDomain: string
  /** Anomaly: where the sentence semantically reads as belonging.
   *  Confirmation: same value as sectionDomain (alignment is the point). */
  sentenceDomain: string
  /** Anomaly: dislocation score from the backend (0–1).
   *  Confirmation: section's classification confidence (0–1, may be 0
   *  if the legacy classifier didn't store one). */
  dislocationScore: number
  severity: 'low' | 'medium' | 'high'
}

export interface AuditResult {
  findings: AuditFinding[]
  totalDocuments: number
  documentsAnalysed: number
  documentsUnavailable: number
  /** Anomalies only: documents whose backend analysis errored (run continued). */
  documentsFailed: number
  totalSentencesAnalysed: number
  /** Map domain label (as returned by backend) -> human-readable display name. */
  domainLabels: string[]
  /** Of `documentsAnalysed`, how many came from cache (no backend call made). */
  cacheHits: number
}

export interface AuditProgress {
  documentIndex: number
  totalDocuments: number
  documentLabel: string
}

export interface RunAuditInput {
  projectId: string
  keywordListId: string
  /** Document-context lens to use as the domain set (typically Function). */
  lensId: string
  /** Anomalies (off-context flags) or Confirmations (in-context proof). */
  mode: AuditMode
  /** Dislocation threshold passed to the backend (0.0–1.0; default 0.3). Anomalies only. */
  threshold?: number
  /** Filter findings to a single polarity, or omit for both. */
  polarity?: KeywordPolarity
}

interface ProjectDocRow {
  id: string
  filename: string
  title: string | null
  year: number | null
  extracted_text: string | null
}

export async function runAudit(
  input: RunAuditInput,
  onProgress?: (p: AuditProgress) => void
): Promise<AuditResult> {
  // 1. Validate lens + load values for the domain payload.
  const lens = await getLens(input.lensId)
  if (!lens) throw new Error(`Lens ${input.lensId} not found`)
  if (lens.type !== 'document-context') {
    throw new Error(
      `Lens "${lens.name}" is keyword-attached; Audit needs a document-context lens (e.g., Function).`
    )
  }
  const lensValues = await listLensValues(input.lensId)
  if (lensValues.length < 2) {
    throw new Error(`Lens "${lens.name}" needs at least 2 values to audit against.`)
  }
  const domainLabels = lensValues.map((v) => domainLabelFor(v))

  // 2. Load project documents (with extracted text only).
  const docs = await selectAll<ProjectDocRow>(
    'audit.projectDocs',
    [input.projectId]
  )

  // 3. Load keywords filtered by polarity (when set).
  const allKeywords = await listKeywords(input.keywordListId)
  const keywords = allKeywords.filter((k) => {
    if (!k.enabled) return false
    if (input.polarity && k.polarity !== input.polarity) return false
    return true
  })
  if (keywords.length === 0) {
    return {
      findings: [],
      totalDocuments: docs.length,
      documentsAnalysed: 0,
      documentsUnavailable: 0,
      documentsFailed: 0,
      totalSentencesAnalysed: 0,
      domainLabels,
      cacheHits: 0,
    }
  }

  // 4. Per document: branch on mode.
  const findings: AuditFinding[] = []
  let documentsAnalysed = 0
  let documentsUnavailable = 0
  let documentsFailed = 0
  let totalSentences = 0
  let cacheHits = 0
  let lastError: string | undefined

  // Precompile keyword regexes once; reused everywhere.
  const keywordRegexes = keywords.map((k) => ({
    keyword: k,
    pattern: buildKeywordRegex(k.text),
  }))

  const threshold = input.threshold ?? 0.3

  // Build a quick lensValueId -> display label map for confirmations.
  const lensValueLabels = new Map<string, string>()
  for (const v of lensValues) {
    lensValueLabels.set(v.id, v.displayName ?? v.value)
  }

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const docLabel = doc.title ?? doc.filename
    const text = doc.extracted_text ?? ''

    onProgress?.({
      documentIndex: i,
      totalDocuments: docs.length,
      documentLabel: docLabel,
    })

    if (!text.trim()) {
      documentsUnavailable++
      continue
    }

    if (input.mode === 'confirmations') {
      // Confirmations: per-section keyword scan over already-classified
      // sections. No backend call, no embedding work — purely local.
      const sections = await listSections(doc.id)
      const tags = await getSectionTagsForDocument(doc.id, input.lensId)
      if (sections.length === 0 || tags.size === 0) {
        // Document hasn't been classified for this lens — skip silently.
        // (User can run classification on Setup.)
        continue
      }
      documentsAnalysed++
      for (const section of sections) {
        const tag = tags.get(section.id)
        if (!tag) continue  // section unclassified for this lens
        const domainLabel = lensValueLabels.get(tag.valueId) ?? tag.valueId
        const confidence = tag.confidence ?? 0
        const severity = confidenceToSeverity(confidence)
        for (const { keyword, pattern } of keywordRegexes) {
          let m: RegExpExecArray | null
          while ((m = pattern.exec(section.text)) !== null) {
            findings.push({
              mode: 'confirmations',
              documentId: doc.id,
              documentTitle: docLabel,
              documentYear: doc.year,
              keyword: keyword.text,
              keywordPolarity: keyword.polarity,
              sentenceText: extractWindowAround(section.text, m.index, m[0].length),
              sectionDomain: domainLabel,
              sentenceDomain: domainLabel,  // alignment is the point
              dislocationScore: confidence,
              severity,
            })
          }
          pattern.lastIndex = 0
        }
      }
      continue
    }

    // Anomalies (default): call backend (or pull from cache), find
    // keyword-bearing dislocations.
    const cacheKey = await buildAuditCacheKey(text, input.lensId, threshold, domainLabels)
    let response = await readAuditCache(input.projectId, cacheKey)
    if (response) {
      cacheHits++
    } else {
      // Per-document isolation: a backend failure on one document (e.g. it's
      // too large and the engine drops the connection) is recorded and the
      // run continues with the next, rather than aborting the whole audit.
      try {
        response = await api.detectStructuralMismatch(text, domainLabels, threshold)
      } catch (err) {
        documentsFailed++
        lastError = err instanceof Error ? err.message : String(err)
        continue
      }
      await writeAuditCache(input.projectId, cacheKey, response)
    }
    documentsAnalysed++
    totalSentences += response.total_sentences_analyzed

    for (const dislocation of response.dislocations) {
      const sentence = dislocation.sentence_text
      for (const { keyword, pattern } of keywordRegexes) {
        if (pattern.test(sentence)) {
          findings.push({
            mode: 'anomalies',
            documentId: doc.id,
            documentTitle: docLabel,
            documentYear: doc.year,
            keyword: keyword.text,
            keywordPolarity: keyword.polarity,
            sentenceText: sentence,
            sectionDomain: shortLabelFromDomainPayload(dislocation.parent_section_domain),
            sentenceDomain: shortLabelFromDomainPayload(dislocation.sentence_domain),
            dislocationScore: dislocation.dislocation_score,
            severity: dislocation.severity,
          })
          // Don't break — a sentence could contain multiple keywords;
          // each is a distinct finding.
        }
        // Reset regex lastIndex since /g flag persists across .test() calls.
        pattern.lastIndex = 0
      }
    }
  }

  // If every document's backend analysis failed, surface the reason rather
  // than returning an empty "no anomalies" result that looks like success.
  if (documentsAnalysed === 0 && documentsFailed > 0) {
    throw new Error(
      `Anomalies analysis failed for all ${documentsFailed} document${documentsFailed === 1 ? '' : 's'}. ${lastError ?? ''}`.trim()
    )
  }

  // 5. Sort findings: severity desc, then doc title, then sentence index.
  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
  findings.sort((a, b) => {
    const sev = severityOrder[b.severity] - severityOrder[a.severity]
    if (sev !== 0) return sev
    if (a.documentTitle !== b.documentTitle) return a.documentTitle.localeCompare(b.documentTitle)
    return b.dislocationScore - a.dislocationScore
  })

  return {
    findings,
    totalDocuments: docs.length,
    documentsAnalysed,
    documentsUnavailable,
    documentsFailed,
    totalSentencesAnalysed: totalSentences,
    domainLabels,
    cacheHits,
  }
}

// ---------------------------------------------------------------------------
// Cache: per-doc /semantic/structural-mismatch responses
// ---------------------------------------------------------------------------
//
// Embedding every sentence in a 50-page report takes ~10–60s per doc; a
// 20-doc audit can run for 5–20 min. The response only depends on
// (extracted_text, lens label set, threshold), so we cache it in the
// existing analysis_cache table. Invalidation is by key change — if any
// of those inputs differ, the key changes and we re-call the backend.
//
// Cache key shape:
//   audit:v1:<sha1(text \x1f lensId \x1f threshold \x1f sortedLabels)>
//
// Bump the v1 prefix if the response format changes (forces re-fetch).

const AUDIT_CACHE_PREFIX = 'audit:v1:'

async function buildAuditCacheKey(
  text: string,
  lensId: string,
  threshold: number,
  domainLabels: string[]
): Promise<string> {
  const parts = [
    text,
    lensId,
    threshold.toString(),
    [...domainLabels].sort().join('\x1f'),
  ]
  const payload = parts.join('\x1f')
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(payload))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return AUDIT_CACHE_PREFIX + hex
}

async function readAuditCache(
  projectId: string,
  cacheKey: string
): Promise<StructuralMismatchResponse | null> {
  const row = await selectOne<{ result: string }>('audit.getCache', [projectId, cacheKey])
  if (!row) return null
  try {
    return JSON.parse(row.result) as StructuralMismatchResponse
  } catch {
    return null  // corrupt entry — fall through to a fresh call
  }
}

async function writeAuditCache(
  projectId: string,
  cacheKey: string,
  response: StructuralMismatchResponse
): Promise<void> {
  await runStatement('audit.writeCache', [
    projectId,
    cacheKey,
    JSON.stringify(response),
    now(),
  ])
}

/**
 * Same domain-label format as services/classification.ts so the audit
 * sends the same payload the Function classifier sends — keeps the
 * embedding model consistent across the two analyses.
 */
function domainLabelFor(value: LensValue): string {
  const head = value.displayName ?? value.value
  return value.description ? `${head}: ${value.description}` : head
}

/**
 * The backend's response includes the FULL "displayName: description"
 * label. For UI presentation, just the displayName part is what the
 * user wants to see (the description was extra context for the embedding
 * model, not a label).
 */
function shortLabelFromDomainPayload(payload: string): string {
  const colonIdx = payload.indexOf(':')
  return colonIdx > 0 ? payload.slice(0, colonIdx).trim() : payload
}

/**
 * Same regex shape as services/coverage.ts and services/concordance.ts.
 * Note: callers must reset pattern.lastIndex = 0 after each .test() call
 * because of the /g flag.
 */
function buildKeywordRegex(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return /\s/.test(keyword)
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')
}

/**
 * Extract a ~25 word window around a match offset, used by Confirmations
 * to give the user a quoted snippet showing the keyword in its
 * verified-context section.
 */
function extractWindowAround(text: string, offset: number, length: number): string {
  const CONTEXT_WORDS = 25
  const before = text.slice(0, offset)
  const matched = text.slice(offset, offset + length)
  const after = text.slice(offset + length)
  const beforeWords = before.split(/\s+/).filter(Boolean).slice(-CONTEXT_WORDS).join(' ')
  const afterWords = after.split(/\s+/).filter(Boolean).slice(0, CONTEXT_WORDS).join(' ')
  return `…${beforeWords} ${matched} ${afterWords}…`.trim()
}

/**
 * Map section classification confidence (cosine similarity from
 * sentence-transformers) to a severity bucket so the existing severity
 * filter UI distributes findings meaningfully. Thresholds are
 * calibrated to typical similarity-score distributions: in practice
 * the sentence-transformers section→domain cosine lands around
 * 0.20–0.50, with strong matches above 0.45.
 *
 * Sections classified before confidence was stored (legacy / score=0)
 * fall back to 'medium' so they aren't penalised.
 */
function confidenceToSeverity(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence === 0) return 'medium'  // no confidence stored
  if (confidence >= 0.45) return 'high'
  if (confidence >= 0.30) return 'medium'
  return 'low'
}
