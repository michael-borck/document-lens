/**
 * Per-mention validation export (ADR-0031).
 *
 * One CSV row per mention, shaped for the researchers' manual coding
 * instrument: the tool pre-populates the *finding* columns (where each
 * mention is and what it matched) and ships the *judgement* columns
 * (Relevance, Framing, Prominence, Notes) empty — the find/judge split
 * (ADR-0030).
 *
 * Deduplication rule — one row per value of the PRIMARY keyword-attached
 * axis (SDG in the seeded lens) per passage: several terms firing in one
 * sentence for the same primary value collapse into one row ("net zero
 * carbon emissions" = 1 hit); the same sentence raising different primary
 * values gets one row each. Passage = sentence window, the same unit the
 * exclusion veto uses, so exported rows reconcile with in-app counts.
 *
 * A verbatim repeat of a passage elsewhere in the document (boilerplate)
 * is kept but flagged `dupe`, mirroring the coding sheet's auto-flag —
 * the researchers audit repeats, they don't want them silently dropped.
 *
 * Alongside the rows, mention-counts.csv reports the RAW mention count
 * per document (pre-collapse) — the researchers' denominator for the
 * false-positive rate and the mention-versus-claim gap.
 */

import { stringifyCsv } from './csv'
import { getKeywordListAxes } from './keyword-lists'
import { getAxis, listAxisValues } from './axes'
import { listSectionsForDocuments, getSectionTagsForDocuments, type DocumentSection } from './sections'
import { getPageOffsets, findPageForOffset, type PageOffset } from './document-pages'
import { sentenceWindowBounds } from './_shared/keyword-match'
import { selectAll } from './db'
import type { ProjectCorpus } from './_shared/project-corpus'
import type { Document, AxisValue, KeywordPolarity } from '@/types/data'

export interface PerMentionExportInput {
  docs: Document[]
  posCorpus: ProjectCorpus
  cntCorpus: ProjectCorpus
  keywordListId: string
  /**
   * Document-context axis whose section tags fill the suggested-domain
   * column (the Function axis in the seeded lens). The column is a tool
   * suggestion and is overridable by the researcher; values the
   * researchers reserve for humans (e.g. Cross-cutting) are never
   * emitted because the classifier never assigns them (ADR-0033).
   */
  subjectLensId: string | null
}

export interface PerMentionFile {
  filename: string
  content: string
}

interface KwTagRow {
  keyword_id: string
  value_id: string
}

interface MentionGroup {
  polarity: KeywordPolarity
  /** Primary-axis value id ('' when the keyword carries no primary tag). */
  primaryValueId: string
  sentStart: number
  sentEnd: number
  /** Distinct matched terms (lowercase key) → first casing + first offset. */
  terms: Map<string, { text: string; offset: number }>
  /** Raw spans collapsed into this row. */
  spanCount: number
  /** Earliest span start — anchors the page and section joins. */
  firstSpanStart: number
  /** Contributing keywords' value ids per non-primary axis. */
  otherAxisValueIds: Map<string, Set<string>>
}

export async function buildPerMentionFiles(input: PerMentionExportInput): Promise<PerMentionFile[]> {
  const { docs, posCorpus, cntCorpus, keywordListId, subjectLensId } = input

  // --- axis metadata for the keyword list ---------------------------------
  const lensIds = await getKeywordListAxes(keywordListId)
  const primaryLensId = lensIds[0] ?? null
  const otherLensIds = lensIds.slice(1)

  const lensNameById = new Map<string, string>()
  const valueById = new Map<string, AxisValue>()
  for (const lensId of lensIds) {
    const axis = await getAxis(lensId)
    lensNameById.set(lensId, axis?.name ?? lensId)
    for (const v of await listAxisValues(lensId)) valueById.set(v.id, v)
  }

  // keyword_id → value_id[] per axis
  const kwTagsByLens = new Map<string, Map<string, string[]>>()
  for (const lensId of lensIds) {
    const rows = await selectAll<KwTagRow>('keywords.tagsForList', [keywordListId, lensId])
    const map = new Map<string, string[]>()
    for (const row of rows) {
      const list = map.get(row.keyword_id) ?? []
      list.push(row.value_id)
      map.set(row.keyword_id, list)
    }
    kwTagsByLens.set(lensId, map)
  }

  // --- section + page joins ----------------------------------------------
  const docIds = docs.map((d) => d.id)
  const sectionsByDoc = await listSectionsForDocuments(docIds)
  const sectionTagsByDoc = subjectLensId
    ? await getSectionTagsForDocuments(docIds, subjectLensId)
    : new Map<string, Map<string, { valueId: string; confidence: number | null }>>()
  const subjectValueById = new Map<string, AxisValue>()
  if (subjectLensId) {
    for (const v of await listAxisValues(subjectLensId)) subjectValueById.set(v.id, v)
  }
  const pageOffsetsByDoc = new Map<string, PageOffset[]>()
  for (const doc of docs) {
    pageOffsetsByDoc.set(doc.id, await getPageOffsets(doc.id))
  }

  // --- collect + collapse mentions ----------------------------------------
  const mentionHeader = [
    'university', 'document', 'year', 'page',
    ...lensIds.map((id) => lensNameById.get(id) ?? id),
    'word', 'passage', 'domain_suggested',
    'relevance', 'framing', 'prominence', 'notes',
    'polarity', 'provenance', 'duplicate', 'mentions_in_passage',
  ]
  const mentionRows: Array<Array<string | number | null>> = [mentionHeader]

  const countHeader = [
    'document', 'university', 'year',
    'raw_mentions_positive', 'raw_mentions_counter', 'raw_mentions_total',
    'deduplicated_rows',
  ]
  const countRows: Array<Array<string | number | null>> = [countHeader]
  let totalRawPos = 0
  let totalRawCnt = 0
  let totalDeduped = 0

  for (const doc of docs) {
    const text = doc.extractedText ?? ''
    const groups = new Map<string, MentionGroup>()
    let rawPos = 0
    let rawCnt = 0

    for (const { corpus, polarity } of [
      { corpus: posCorpus, polarity: 'positive' as const },
      { corpus: cntCorpus, polarity: 'counter' as const },
    ]) {
      for (const kw of corpus.keywords) {
        const spans = corpus.spansFor(doc.id, kw.id)
        if (spans.length === 0) continue
        if (polarity === 'positive') rawPos += spans.length
        else rawCnt += spans.length

        const primaryValueIds = primaryLensId
          ? kwTagsByLens.get(primaryLensId)?.get(kw.id) ?? ['']
          : ['']

        for (const span of spans) {
          const bounds = sentenceWindowBounds(text, span.start, span.end)
          for (const primaryValueId of primaryValueIds.length > 0 ? primaryValueIds : ['']) {
            const key = `${polarity}|${primaryValueId}|${bounds.start}`
            let group = groups.get(key)
            if (!group) {
              group = {
                polarity,
                primaryValueId,
                sentStart: bounds.start,
                sentEnd: bounds.end,
                terms: new Map(),
                spanCount: 0,
                firstSpanStart: span.start,
                otherAxisValueIds: new Map(),
              }
              groups.set(key, group)
            }
            group.spanCount++
            group.firstSpanStart = Math.min(group.firstSpanStart, span.start)
            const termKey = span.matched.toLowerCase()
            const known = group.terms.get(termKey)
            if (!known || span.start < known.offset) {
              group.terms.set(termKey, { text: span.matched, offset: span.start })
            }
            for (const lensId of otherLensIds) {
              const valueIds = kwTagsByLens.get(lensId)?.get(kw.id) ?? []
              if (valueIds.length === 0) continue
              let set = group.otherAxisValueIds.get(lensId)
              if (!set) {
                set = new Set()
                group.otherAxisValueIds.set(lensId, set)
              }
              for (const id of valueIds) set.add(id)
            }
          }
        }
      }
    }

    // Order rows the way a coder reads: by position, then primary-axis
    // order, positive before counter on a tie.
    const ordered = Array.from(groups.values()).sort((a, b) =>
      a.sentStart - b.sentStart ||
      (valueById.get(a.primaryValueId)?.sortOrder ?? 0) - (valueById.get(b.primaryValueId)?.sortOrder ?? 0) ||
      (a.polarity === b.polarity ? 0 : a.polarity === 'positive' ? -1 : 1)
    )

    const sections = sectionsByDoc.get(doc.id) ?? []
    const sectionTags = sectionTagsByDoc.get(doc.id)
    const pageOffsets = pageOffsetsByDoc.get(doc.id) ?? []
    const seenPassages = new Set<string>()

    for (const g of ordered) {
      const passage = extractPassage(text, g.sentStart, g.sentEnd)
      const dupeKey = `${g.polarity}|${g.primaryValueId}|${passage}`
      const duplicate = seenPassages.has(dupeKey) ? 'dupe' : ''
      seenPassages.add(dupeKey)

      const primaryValue = valueById.get(g.primaryValueId)
      const lensCols = lensIds.map((lensId) => {
        if (lensId === primaryLensId) {
          return primaryValue ? primaryValue.displayName ?? primaryValue.value : ''
        }
        const ids = g.otherAxisValueIds.get(lensId)
        if (!ids || ids.size === 0) return ''
        return Array.from(ids)
          .map((id) => {
            const v = valueById.get(id)
            return v ? v.displayName ?? v.value : id
          })
          .join(' | ')
      })

      const section = findSectionForPosition(sections, g.firstSpanStart)
      const tag = section ? sectionTags?.get(section.id) : undefined
      const domainValue = tag ? subjectValueById.get(tag.valueId) : undefined
      const domain = domainValue ? domainValue.displayName ?? domainValue.value : ''
      const page = findPageForOffset(pageOffsets, g.firstSpanStart)

      mentionRows.push([
        doc.company ?? '',
        doc.title ?? doc.filename,
        doc.year ?? '',
        page ?? '',
        ...lensCols,
        Array.from(g.terms.values())
          .sort((a, b) => a.offset - b.offset)
          .map((t) => t.text)
          .join(' | '),
        passage,
        domain,
        '', // relevance — researcher's gate
        '', // framing — researcher's judgement
        '', // prominence — manual until ADR-0032 lands
        '', // notes
        g.polarity,
        'Voluntary', // provenance default; researchers overwrite where Mandated
        duplicate,
        g.spanCount,
      ])
    }

    countRows.push([
      doc.title ?? doc.filename,
      doc.company ?? '',
      doc.year ?? '',
      rawPos,
      rawCnt,
      rawPos + rawCnt,
      ordered.length,
    ])
    totalRawPos += rawPos
    totalRawCnt += rawCnt
    totalDeduped += ordered.length
  }

  countRows.push(['TOTAL', '', '', totalRawPos, totalRawCnt, totalRawPos + totalRawCnt, totalDeduped])

  return [
    { filename: 'mentions.csv', content: stringifyCsv(mentionRows) },
    { filename: 'mention-counts.csv', content: stringifyCsv(countRows) },
  ]
}

/**
 * The passage a coder pastes: the sentence window plus its terminating
 * punctuation (the bounds stop before it), whitespace-trimmed.
 */
function extractPassage(text: string, start: number, end: number): string {
  const withTerminator = end < text.length && /[.!?]/.test(text[end]) ? end + 1 : end
  return text.slice(start, withTerminator).replace(/\s+/g, ' ').trim()
}

/** Binary-search the section list (ordered by offset) containing a position. */
function findSectionForPosition(
  sections: DocumentSection[],
  offset: number
): DocumentSection | null {
  let lo = 0
  let hi = sections.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const s = sections[mid]
    if (offset < s.startOffset) hi = mid - 1
    else if (offset >= s.endOffset) lo = mid + 1
    else return s
  }
  return null
}
