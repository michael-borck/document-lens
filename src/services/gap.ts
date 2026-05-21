import { selectAll, selectOne, runStatement } from './db'
import { listKeywords, getKeywordListLenses, listEnabledSynonymsForKeywords } from './keyword-lists'
import { detectSections } from './sections'
import { type DocumentRow, rowToDocument } from './_shared/document-row'
import { findConceptSpans } from './_shared/keyword-match'
import {
  substanceRatio, gapFromDiagonal, fitLine, gapFromResidual, type GapReference,
} from './_shared/gap-math'
import { api } from './api'
import type { Document, Keyword } from '@/types/data'

export type GapLevel = 'document' | 'section' | 'keyword'

export interface GapPoint {
  id: string
  label: string
  documentId: string
  documentLabel: string
  substance: number
  tone: number
  gap: number
  weight: number      // keyword match frequency (1 for doc/section)
}

export interface GapDataset {
  byLevel: Record<GapLevel, GapPoint[]>
  overTime: Array<{ year: number; avgGap: number; count: number }>
  overTimeAvailable: boolean
  singleDocument: boolean
}

interface SectionData {
  documentId: string
  documentLabel: string
  index: number
  text: string
  start: number
  end: number
  positive: number   // positive-keyword matches in this section
  counter: number    // counter-keyword matches in this section
  tone: number       // filled in Task 6
}

function docLabel(d: Document): string {
  return d.title || d.company || d.filename
}

/** Per-document detected sections with local positive/counter match counts. */
async function buildSections(docs: Document[], keywords: Keyword[]): Promise<SectionData[]> {
  const synByKw = await listEnabledSynonymsForKeywords(keywords.map((k) => k.id))
  const out: SectionData[] = []
  for (const doc of docs) {
    const text = doc.extractedText ?? ''
    if (!text) continue
    const sections = detectSections(text)
    for (const sec of sections) {
      let positive = 0, counter = 0
      for (const kw of keywords) {
        const terms = [kw.text, ...(synByKw.get(kw.id) ?? [])]
        const n = findConceptSpans(sec.text, terms).length
        if (n === 0) continue
        if (kw.polarity === 'counter') counter += n
        else positive += n
      }
      out.push({
        documentId: doc.id, documentLabel: docLabel(doc), index: sec.index,
        text: sec.text, start: sec.startOffset, end: sec.endOffset,
        positive, counter, tone: 0,
      })
    }
  }
  return out
}

export { buildSections, docLabel, substanceRatio, gapFromDiagonal, fitLine, gapFromResidual }
export type { SectionData, GapReference }

function hashSections(secs: SectionData[]): string {
  let h = 0
  const key = secs.map((s) => `${s.documentId}:${s.index}:${s.start}-${s.end}`).join('|')
  for (let i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) | 0 }
  return String(h)
}

/** Fill section tones via the backend, cached per project+section-set. */
async function fillSectionTones(projectId: string, secs: SectionData[]): Promise<void> {
  if (secs.length === 0) return
  const cacheKey = `gap-sentiment:${hashSections(secs)}`
  const cached = await selectOne<{ result: string }>('analysisCache.get', [projectId, cacheKey])
  if (cached) {
    const scores: Record<string, number> = JSON.parse(cached.result)
    secs.forEach((s, i) => { s.tone = scores[String(i)] ?? 0 })
    return
  }
  const resp = await api.analyzeSentimentBatch(
    secs.map((s, i) => ({ id: String(i), text: s.text }))
  )
  const scores: Record<string, number> = {}
  for (const r of resp.results) scores[r.id] = r.sentiment.score
  secs.forEach((s, i) => { s.tone = scores[String(i)] ?? 0 })
  await runStatement('analysisCache.put', [
    projectId, cacheKey, JSON.stringify(scores), new Date().toISOString(),
  ])
}

const RESIDUAL_MIN_POINTS = 8

function buildPoints(
  secs: SectionData[], _docs: Document[], level: GapLevel, reference: GapReference
): GapPoint[] {
  if (level === 'keyword') return []
  type Raw = { id: string; label: string; documentId: string; documentLabel: string; substance: number; tone: number; weight: number }
  const raws: Raw[] = []

  if (level === 'section') {
    for (const s of secs) {
      const sub = substanceRatio(s.positive, s.counter)
      if (sub === null) continue
      raws.push({ id: `${s.documentId}:${s.index}`, label: `${s.documentLabel} §${s.index + 1}`,
        documentId: s.documentId, documentLabel: s.documentLabel, substance: sub, tone: s.tone, weight: 1 })
    }
  } else {
    // document level
    const byDoc = new Map<string, SectionData[]>()
    for (const s of secs) { const a = byDoc.get(s.documentId) ?? []; a.push(s); byDoc.set(s.documentId, a) }
    for (const [docId, list] of byDoc) {
      const pos = list.reduce((n, s) => n + s.positive, 0)
      const cnt = list.reduce((n, s) => n + s.counter, 0)
      const sub = substanceRatio(pos, cnt)
      if (sub === null) continue
      const totalLen = list.reduce((n, s) => n + s.text.length, 0) || 1
      const tone = list.reduce((n, s) => n + s.tone * s.text.length, 0) / totalLen
      raws.push({ id: docId, label: list[0].documentLabel, documentId: docId,
        documentLabel: list[0].documentLabel, substance: sub, tone, weight: 1 })
    }
  }

  let line: { slope: number; intercept: number } | null = null
  if (reference === 'residual' && raws.length >= RESIDUAL_MIN_POINTS) {
    line = fitLine(raws.map((r) => ({ substance: r.substance, tone: r.tone })))
  }
  return raws.map((r) => ({
    ...r,
    gap: line ? gapFromResidual(r.tone, r.substance, line) : gapFromDiagonal(r.tone, r.substance),
  }))
}

export interface ComputeGapInput {
  projectId: string
  keywordListId: string
  reference: GapReference
}

export async function computeGap(input: ComputeGapInput): Promise<GapDataset> {
  const docRows = await selectAll<DocumentRow>('documents.byProject', [input.projectId])
  const docs = docRows.map(rowToDocument).filter((d) => d.extractedText && d.extractedText.length > 0)
  const keywords = (await listKeywords(input.keywordListId)).filter((k) => k.enabled)
  const synByKw = await listEnabledSynonymsForKeywords(keywords.map((k) => k.id))

  const secs = await buildSections(docs, keywords)
  await fillSectionTones(input.projectId, secs)

  // keyword-level points: per (doc, keyword) freq + avg section tone
  const kwPoints: GapPoint[] = []
  {
    type Acc = { polarity: 1 | -1; freq: number; toneWeighted: number; text: string; documentId: string; documentLabel: string }
    const acc = new Map<string, Acc>()
    for (const s of secs) {
      for (const kw of keywords) {
        const terms = [kw.text, ...(synByKw.get(kw.id) ?? [])]
        const n = findConceptSpans(s.text, terms).length
        if (n === 0) continue
        const key = `${s.documentId}:${kw.id}`
        const a = acc.get(key) ?? { polarity: kw.polarity === 'counter' ? -1 : 1, freq: 0, toneWeighted: 0, text: kw.text, documentId: s.documentId, documentLabel: s.documentLabel }
        a.freq += n
        a.toneWeighted += s.tone * n
        acc.set(key, a)
      }
    }
    for (const [key, a] of acc) {
      const tone = a.freq > 0 ? a.toneWeighted / a.freq : 0
      const substance = a.polarity
      kwPoints.push({
        id: key, label: `${a.text} · ${a.documentLabel}`, documentId: a.documentId,
        documentLabel: a.documentLabel, substance, tone, weight: a.freq,
        gap: gapFromDiagonal(tone, substance),
      })
    }
  }

  const byLevel: Record<GapLevel, GapPoint[]> = {
    document: buildPoints(secs, docs, 'document', input.reference),
    section: buildPoints(secs, docs, 'section', input.reference),
    keyword: kwPoints,
  }

  const docYear = new Map(docs.map((d) => [d.id, d.year]))
  const byYear = new Map<number, { sum: number; count: number }>()
  for (const p of byLevel.document) {
    const y = docYear.get(p.documentId)
    if (y == null) continue
    const b = byYear.get(y) ?? { sum: 0, count: 0 }
    b.sum += p.gap; b.count += 1; byYear.set(y, b)
  }
  const overTime = [...byYear.entries()]
    .map(([year, b]) => ({ year, avgGap: b.sum / b.count, count: b.count }))
    .sort((a, b) => a.year - b.year)

  return {
    byLevel,
    overTime,
    overTimeAvailable: overTime.length >= 2,
    singleDocument: docs.length <= 1,
  }
}
