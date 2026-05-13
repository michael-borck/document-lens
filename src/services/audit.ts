/**
 * Audit workflow — find keywords appearing in sections where they
 * don't semantically belong (US-F-01, US-F-02). Wires the backend's
 * /semantic/structural-mismatch endpoint.
 *
 * For each project document:
 *   1. Send extracted text + the document-context lens's value labels
 *      to /semantic/structural-mismatch.
 *   2. Backend returns sentences whose own semantic-domain assignment
 *      differs from their parent section's, with a dislocation_score.
 *   3. For each returned sentence, check which active keywords appear
 *      in it. Surface those as findings.
 *
 * The methodology calls this the "contextual relevance check": e.g.,
 * "climate" mentioned in a Marketing section that semantically reads
 * as Risk Management is suspicious — the audit surfaces it so the
 * researcher can investigate.
 *
 * Confirmations mode (US-F-03) — surface keyword usages in
 * confirmed-context sections — is deferred. Same backend call (or
 * /semantic/domain-mapping) but inverted: surface high-confidence
 * matches instead of dislocations. Adds a layer of UI for switching
 * modes; ship anomalies first.
 */

import { selectAll, selectOne, runStatement, now } from './db'
import { listKeywords } from './keyword-lists'
import { listLensValues, getLens } from './lenses'
import { api, type StructuralMismatchResponse } from './api'
import type {
  Document,
  KeywordPolarity,
  LensValue,
  Lens,
} from '@/types/data'

export interface AuditFinding {
  documentId: string
  documentTitle: string
  documentYear: number | null
  keyword: string
  keywordPolarity: KeywordPolarity
  sentenceText: string
  /** Where the sentence sits — the parent section's classified domain. */
  sectionDomain: string
  /** Where the sentence semantically reads as belonging. */
  sentenceDomain: string
  dislocationScore: number
  severity: 'low' | 'medium' | 'high'
}

export interface AuditResult {
  findings: AuditFinding[]
  totalDocuments: number
  documentsAnalysed: number
  documentsUnavailable: number
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
  /** Dislocation threshold passed to the backend (0.0–1.0; default 0.3). */
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
    `SELECT d.id, d.filename, d.title, d.year, d.extracted_text
       FROM documents d
       JOIN project_documents pd ON pd.document_id = d.id
      WHERE pd.project_id = ?
      ORDER BY d.imported_at`,
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
      totalSentencesAnalysed: 0,
      domainLabels,
      cacheHits: 0,
    }
  }

  // 4. Per document: call backend (or pull from cache), find
  //    keyword-bearing dislocations.
  const findings: AuditFinding[] = []
  let documentsAnalysed = 0
  let documentsUnavailable = 0
  let totalSentences = 0
  let cacheHits = 0

  // Precompile keyword regexes once; reused for every sentence in every doc.
  const keywordRegexes = keywords.map((k) => ({
    keyword: k,
    pattern: buildKeywordRegex(k.text),
  }))

  const threshold = input.threshold ?? 0.3

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

    const cacheKey = await buildAuditCacheKey(text, input.lensId, threshold, domainLabels)
    let response = await readAuditCache(input.projectId, cacheKey)
    if (response) {
      cacheHits++
    } else {
      response = await api.detectStructuralMismatch(text, domainLabels, threshold)
      await writeAuditCache(input.projectId, cacheKey, response)
    }
    documentsAnalysed++
    totalSentences += response.total_sentences_analyzed

    for (const dislocation of response.dislocations) {
      const sentence = dislocation.sentence_text
      for (const { keyword, pattern } of keywordRegexes) {
        if (pattern.test(sentence)) {
          findings.push({
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
  const row = await selectOne<{ result: string }>(
    'SELECT result FROM analysis_cache WHERE project_id = ? AND cache_key = ?',
    [projectId, cacheKey]
  )
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
  await runStatement(
    `INSERT INTO analysis_cache (project_id, cache_key, result, computed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (project_id, cache_key)
       DO UPDATE SET result = excluded.result, computed_at = excluded.computed_at`,
    [projectId, cacheKey, JSON.stringify(response), now()]
  )
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

// Suppress unused-import warning for types imported only for JSDoc-level
// reference (Document and Lens are used in service-internal type plumbing
// that TypeScript's unused-vars rule sometimes misses).
export type _Unused = Document | Lens
