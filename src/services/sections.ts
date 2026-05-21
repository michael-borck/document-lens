/**
 * Document sections: paragraph-grain chunks of a document's extracted
 * text, with character-offset boundaries so a keyword match's position
 * can be joined to the section it belongs to.
 *
 * Detection is paragraph-based (split on consecutive blank lines).
 * Backend's domain_mapper does smarter header-bounded section detection
 * but doesn't return character offsets, which we need for the
 * match-to-section join. Paragraph-level granularity is also FINER
 * than the backend's section detection — annual-report sections often
 * cover multiple Functions, so per-paragraph classification is more
 * accurate for our 2D matrix purposes anyway.
 *
 * Sections shorter than MIN_SECTION_LENGTH characters are dropped (they
 * tend to be page headers / numbers / footnotes that don't contribute
 * meaningfully to topic classification).
 */

import { selectAllKeyed, selectOneKeyed, runStatementKeyed, newId, now } from './db'

export interface DocumentSection {
  id: string
  documentId: string
  sectionIndex: number
  startOffset: number
  endOffset: number
  text: string
  classifiedAt: string | null
}

interface DocumentSectionRow {
  id: string
  document_id: string
  section_index: number
  start_offset: number
  end_offset: number
  text: string
  classified_at: string | null
}

function rowToSection(row: DocumentSectionRow): DocumentSection {
  return {
    id: row.id,
    documentId: row.document_id,
    sectionIndex: row.section_index,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    text: row.text,
    classifiedAt: row.classified_at,
  }
}

export interface DetectedSection {
  index: number
  startOffset: number
  endOffset: number
  text: string
}

const MIN_SECTION_LENGTH = 80   // chars — drops page headers / numbers / footnotes
const MAX_SECTION_LENGTH = 4000 // chars — split very long paragraphs to avoid
                                // overwhelming the embedding model's context

/**
 * Split text into paragraph-grain sections with character offsets.
 *
 * Splits on consecutive blank lines (\n\s*\n+). Each kept section
 * carries its [startOffset, endOffset) range in the original text so a
 * keyword match at offset N can be looked up to find which section
 * contains it.
 *
 * Sections below MIN_SECTION_LENGTH are dropped entirely. Sections
 * above MAX_SECTION_LENGTH are split into chunks at the nearest
 * sentence boundary. If the whole document is one chunk and below the
 * minimum, it's still returned as one section so we don't end up with
 * zero — better one too-short section than no classification.
 */
export function detectSections(text: string): DetectedSection[] {
  if (!text || text.length === 0) return []

  // Find paragraph break positions (1+ blank lines).
  const breaks: Array<{ start: number; end: number }> = []
  const paragraphRegex = /\n\s*\n+/g
  let m: RegExpExecArray | null
  while ((m = paragraphRegex.exec(text)) !== null) {
    breaks.push({ start: m.index, end: m.index + m[0].length })
  }

  // Build paragraph spans: [start, end) of each paragraph in the original text.
  const paragraphs: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const br of breaks) {
    if (br.start > cursor) {
      paragraphs.push({ start: cursor, end: br.start })
    }
    cursor = br.end
  }
  if (cursor < text.length) {
    paragraphs.push({ start: cursor, end: text.length })
  }

  // Build sections. Drop tiny ones; split huge ones at sentence boundary.
  const sections: DetectedSection[] = []
  for (const para of paragraphs) {
    const paraText = text.slice(para.start, para.end)
    const trimmedLen = paraText.trim().length
    if (trimmedLen < MIN_SECTION_LENGTH) continue

    if (paraText.length <= MAX_SECTION_LENGTH) {
      sections.push({
        index: sections.length,
        startOffset: para.start,
        endOffset: para.end,
        text: paraText,
      })
      continue
    }

    // Long paragraph — split into chunks at sentence boundaries.
    let chunkStart = para.start
    while (chunkStart < para.end) {
      const remainingLen = para.end - chunkStart
      if (remainingLen <= MAX_SECTION_LENGTH) {
        sections.push({
          index: sections.length,
          startOffset: chunkStart,
          endOffset: para.end,
          text: text.slice(chunkStart, para.end),
        })
        break
      }
      // Find a sentence boundary near MAX_SECTION_LENGTH from chunkStart.
      const idealEnd = chunkStart + MAX_SECTION_LENGTH
      const slice = text.slice(chunkStart, idealEnd)
      // Search backwards from idealEnd for ". " or ".\n" — the closest
      // sentence boundary that won't slice mid-sentence.
      let breakPoint = -1
      for (const pattern of ['. ', '.\n', '? ', '?\n', '! ', '!\n']) {
        const found = slice.lastIndexOf(pattern)
        if (found > breakPoint) breakPoint = found
      }
      const chunkEnd = breakPoint > MAX_SECTION_LENGTH * 0.5
        ? chunkStart + breakPoint + 2  // include the punctuation + space
        : idealEnd                      // no good boundary found; hard cut
      sections.push({
        index: sections.length,
        startOffset: chunkStart,
        endOffset: chunkEnd,
        text: text.slice(chunkStart, chunkEnd),
      })
      chunkStart = chunkEnd
    }
  }

  // Fallback: if nothing met the minimum threshold, return the entire
  // text as one section so we always have something to classify.
  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({
      index: 0,
      startOffset: 0,
      endOffset: text.length,
      text,
    })
  }

  return sections
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listSections(documentId: string): Promise<DocumentSection[]> {
  const rows = await selectAllKeyed<DocumentSectionRow>('sections.listByDocument', [documentId])
  return rows.map(rowToSection)
}

/**
 * Replace all sections for a document with a fresh detection. Wipes
 * existing sections (and their tags via cascade) so re-classification
 * starts from a clean slate.
 */
export async function persistSections(
  documentId: string,
  detected: DetectedSection[]
): Promise<DocumentSection[]> {
  await runStatementKeyed('sections.deleteByDocument', [documentId])
  const out: DocumentSection[] = []
  for (const sec of detected) {
    const id = newId()
    await runStatementKeyed('sections.create', [
      id,
      documentId,
      sec.index,
      sec.startOffset,
      sec.endOffset,
      sec.text,
    ])
    out.push({
      id,
      documentId,
      sectionIndex: sec.index,
      startOffset: sec.startOffset,
      endOffset: sec.endOffset,
      text: sec.text,
      classifiedAt: null,
    })
  }
  return out
}

export async function findSectionForOffset(
  documentId: string,
  offset: number
): Promise<DocumentSection | null> {
  const row = await selectOneKeyed<DocumentSectionRow>('sections.findForOffset', [
    documentId,
    offset,
    offset,
  ])
  return row ? rowToSection(row) : null
}

export async function markSectionsClassified(
  sectionIds: string[]
): Promise<void> {
  if (sectionIds.length === 0) return
  const timestamp = now()
  for (const id of sectionIds) {
    await runStatementKeyed('sections.markClassified', [timestamp, id])
  }
}

// ---------------------------------------------------------------------------
// Section lens tags
// ---------------------------------------------------------------------------

export async function setSectionTag(
  sectionId: string,
  lensId: string,
  valueId: string,
  confidence: number | null = null
): Promise<void> {
  await runStatementKeyed('sections.setTag', [sectionId, lensId, valueId, confidence])
}

export async function clearSectionTagsForLens(
  documentId: string,
  lensId: string
): Promise<void> {
  await runStatementKeyed('sections.clearTagsForLens', [lensId, documentId])
}

interface SectionTagRow {
  section_id: string
  value_id: string
  confidence: number | null
}

/**
 * Map of section_id -> { value_id, confidence } for one document + lens.
 * Cheap lookup table for the Map workflow's two-axis matrix.
 */
export async function getSectionTagsForDocument(
  documentId: string,
  lensId: string
): Promise<Map<string, { valueId: string; confidence: number | null }>> {
  const rows = await selectAllKeyed<SectionTagRow>('sections.tagsForDocument', [documentId, lensId])
  const result = new Map<string, { valueId: string; confidence: number | null }>()
  for (const row of rows) {
    result.set(row.section_id, { valueId: row.value_id, confidence: row.confidence })
  }
  return result
}

/**
 * How many sections are classified for this document on this lens?
 * Used for progress UI / badge "X of Y sections classified".
 */
export async function countClassifiedSections(
  documentId: string,
  lensId: string
): Promise<number> {
  const row = await selectOneKeyed<{ n: number }>('sections.countClassified', [documentId, lensId])
  return row?.n ?? 0
}
