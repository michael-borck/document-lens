/**
 * Function classification pipeline.
 *
 * For each project document with extracted text:
 *   1. Detect paragraph-grain sections client-side (services/sections).
 *   2. Persist sections (wipes any prior sections for the doc).
 *   3. Send section texts in batches to document-analyser's
 *      /semantic/domain-mapping/batch with the lens's value descriptions
 *      as the "domains" argument.
 *   4. For each result, save the primary domain assignment as a
 *      section_lens_tags row.
 *   5. Mark sections as classified.
 *
 * v1 only handles one axis at a time (typically the Function axis).
 * The same machinery generalises to any document-context axis; the
 * caller passes the axis id.
 */

import { api } from './api'
import {
  detectSections,
  persistSections,
  setSectionTag,
  clearSectionTagsForLens,
  markSectionsClassified,
  countClassifiedSectionsForDocuments,
  listSections,
  type DocumentSection,
} from './sections'
import { getAxis, listAxisValues } from './axes'
import { selectAll } from './db'
import type { AxisValue } from '@/types/data'

const BATCH_SIZE = 50  // max sections per backend call — keeps single requests reasonable

export interface ClassifyDocumentProgress {
  /** Document index in the queue (0-based). */
  documentIndex: number
  /** Total documents in the queue. */
  totalDocuments: number
  /** Identifier shown to the user — title || filename. */
  documentLabel: string
  /** Sections classified so far for the current document. */
  sectionsDone: number
  /** Total sections detected for the current document. */
  sectionsTotal: number
}

export interface ClassifyDocumentResult {
  documentId: string
  sectionsDetected: number
  sectionsTagged: number
  /** True when the document had no extracted text. */
  unavailable: boolean
  /** True when classification errored for this document (e.g. backend down). */
  failed?: boolean
  /** Error message when `failed` is true. */
  error?: string
}

export interface ClassifyResult {
  documentsProcessed: number
  documentsUnavailable: number
  /** Documents whose classification errored (run continued past them). */
  documentsFailed: number
  totalSectionsTagged: number
  perDocument: ClassifyDocumentResult[]
}

/**
 * Classify all documents in a project on the given lens.
 *
 * Idempotent in the sense of "re-running won't break anything" — but
 * it does wipe and re-detect sections each time, then re-classify.
 * For an incremental "only do new docs" pass, callers should filter
 * the document list themselves.
 */
export async function classifyProjectFunctions(
  projectId: string,
  lensId: string,
  onProgress?: (p: ClassifyDocumentProgress) => void
): Promise<ClassifyResult> {
  // Validate axis.
  const axis = await getAxis(lensId)
  if (!axis) throw new Error(`Axis ${lensId} not found`)
  const lensValues = await listAxisValues(lensId)
  if (lensValues.length < 2) {
    throw new Error(
      `Axis "${axis.name}" needs at least 2 values to classify against; has ${lensValues.length}.`
    )
  }

  // Load project documents.
  const docs = await selectAll<{
    id: string
    filename: string
    title: string | null
    extracted_text: string | null
  }>('classification.projectDocsForClassify', [projectId])

  // Pre-compute the "domains" payload sent to the backend. We use each
  // value's display name + description as the label so the embedding
  // model has useful semantic context, not just the bare value code.
  const domainLabels = lensValues.map((v: AxisValue) => domainLabelFor(v))

  const perDocument: ClassifyDocumentResult[] = []
  let documentsUnavailable = 0
  let documentsFailed = 0
  let totalSectionsTagged = 0

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]
    const docLabel = doc.title ?? doc.filename
    const text = doc.extracted_text ?? ''

    if (!text.trim()) {
      documentsUnavailable++
      perDocument.push({
        documentId: doc.id,
        sectionsDetected: 0,
        sectionsTagged: 0,
        unavailable: true,
      })
      onProgress?.({
        documentIndex: i,
        totalDocuments: docs.length,
        documentLabel: docLabel,
        sectionsDone: 0,
        sectionsTotal: 0,
      })
      continue
    }

    // Per-document isolation: a backend failure on one document is recorded
    // and the run continues with the next, rather than aborting the whole pass
    // (which would discard every already-classified document's progress).
    try {
      // 1. Detect sections + persist (wipes any prior sections).
      const detected = detectSections(text)
      const sections = await persistSections(doc.id, detected)

      // 2. Wipe any prior tags for this lens on these sections (handled
      //    automatically by persistSections's CASCADE delete since the
      //    section ids are new).
      await clearSectionTagsForLens(doc.id, lensId)

      onProgress?.({
        documentIndex: i,
        totalDocuments: docs.length,
        documentLabel: docLabel,
        sectionsDone: 0,
        sectionsTotal: sections.length,
      })

      // 3. Classify in batches.
      let sectionsTagged = 0
      for (let offset = 0; offset < sections.length; offset += BATCH_SIZE) {
        const batch = sections.slice(offset, offset + BATCH_SIZE)
        const texts = batch.map((s) => s.text)
        let responses: Awaited<ReturnType<typeof api.mapDomainsBatch>>
        try {
          responses = await api.mapDomainsBatch(texts, domainLabels)
        } catch (err) {
          throw new Error(
            `Classification failed for ${docLabel} (sections ${offset}..${offset + batch.length}): ${err instanceof Error ? err.message : String(err)}`
          )
        }

        // 4. Tag each section by its primary domain. Backend returns
        //    one DomainMappingResponse per input text. Each response's
        //    mappings[0] is the assignment we want — even when backend's
        //    own _detect_sections splits the input further, the first
        //    mapping is still the dominant classification.
        for (let j = 0; j < batch.length; j++) {
          const section = batch[j]
          const response = responses[j]
          if (!response || response.mappings.length === 0) continue
          const primary = response.mappings[0].primary_domain
          const value = lensValues.find((v: AxisValue) => domainLabelFor(v) === primary)
          if (!value) continue
          await setSectionTag(
            section.id,
            lensId,
            value.id,
            response.mappings[0].similarity_score
          )
          sectionsTagged++
        }

        onProgress?.({
          documentIndex: i,
          totalDocuments: docs.length,
          documentLabel: docLabel,
          sectionsDone: Math.min(offset + batch.length, sections.length),
          sectionsTotal: sections.length,
        })
      }

      await markSectionsClassified(sections.map((s) => s.id))

      totalSectionsTagged += sectionsTagged
      perDocument.push({
        documentId: doc.id,
        sectionsDetected: sections.length,
        sectionsTagged,
        unavailable: false,
      })
    } catch (err) {
      documentsFailed++
      perDocument.push({
        documentId: doc.id,
        sectionsDetected: 0,
        sectionsTagged: 0,
        unavailable: false,
        failed: true,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    documentsProcessed: docs.length - documentsUnavailable - documentsFailed,
    documentsUnavailable,
    documentsFailed,
    totalSectionsTagged,
    perDocument,
  }
}

/**
 * Status snapshot for the Setup-tab Function classification panel.
 */
export interface ClassificationStatus {
  /** Total documents in the project. */
  totalDocuments: number
  /** Documents with at least one section classified on this lens. */
  classifiedDocuments: number
  /** Documents whose extracted_text is missing/empty (can't classify). */
  unavailableDocuments: number
}

export async function getClassificationStatus(
  projectId: string,
  lensId: string
): Promise<ClassificationStatus> {
  const docs = await selectAll<{ id: string; extracted_text: string | null }>(
    'classification.projectDocText',
    [projectId]
  )
  // One batched count instead of a query per document.
  const available = docs.filter(
    (doc) => doc.extracted_text && doc.extracted_text.trim().length > 0
  )
  const unavailableDocuments = docs.length - available.length
  const counts = await countClassifiedSectionsForDocuments(
    available.map((d) => d.id),
    lensId
  )
  let classifiedDocuments = 0
  for (const doc of available) {
    if ((counts.get(doc.id) ?? 0) > 0) classifiedDocuments++
  }
  return {
    totalDocuments: docs.length,
    classifiedDocuments,
    unavailableDocuments,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Label used in the backend's "domains" payload. We send display name
 * + description so the embedding model has more semantic context than
 * just the bare value code (e.g., "Teaching: Curriculum, pedagogy,
 * student learning, course design." rather than just "teaching").
 *
 * The exact same string is used to map the response's `primary_domain`
 * back to the lens value, so we look up by this label.
 */
function domainLabelFor(value: AxisValue): string {
  const head = value.displayName ?? value.value
  return value.description ? `${head}: ${value.description}` : head
}

/**
 * Re-export so callers don't need to import sections separately just
 * to materialise the result of a classification run.
 */
export { listSections, type DocumentSection }
