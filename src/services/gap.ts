import { selectOne, runStatement } from './db'
import { detectSections } from './sections'
import { findConceptSpans } from './_shared/keyword-match'
import { loadProjectCorpus, type ProjectCorpus } from './_shared/project-corpus'
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
async function buildSections(corpus: ProjectCorpus, docs: Document[], keywords: Keyword[]): Promise<SectionData[]> {
  const out: SectionData[] = []
  for (const doc of docs) {
    const text = doc.extractedText ?? ''
    if (!text) continue
    const sections = detectSections(text)
    for (const sec of sections) {
      let positive = 0, counter = 0
      for (const kw of keywords) {
        const terms = corpus.termsFor(kw)
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

// Content-addressed cache key for a section set. A SHA-1 digest of the
// ordered (documentId:index:start-end) tuples — same approach as audit.ts.
// The old hand-rolled 32-bit hash could collide and then apply a cached tone
// map (which is positional, keyed by array index) to the WRONG sections,
// silently corrupting gap values. v1 prefix lets us invalidate if the shape
// changes; old `gap-sentiment:<32bit>` rows simply never match again.
const GAP_SENTIMENT_PREFIX = 'gap-sentiment:v1:'

async function sectionsCacheKey(secs: SectionData[]): Promise<string> {
  const payload = secs.map((s) => `${s.documentId}:${s.index}:${s.start}-${s.end}`).join('|')
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(payload))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return GAP_SENTIMENT_PREFIX + hex
}

/** Fill section tones via the backend, cached per project+section-set. */
async function fillSectionTones(projectId: string, secs: SectionData[]): Promise<void> {
  if (secs.length === 0) return
  const cacheKey = await sectionsCacheKey(secs)
  const cached = await selectOne<{ result: string }>('analysisCache.get', [projectId, cacheKey])
  if (cached) {
    try {
      const scores: Record<string, number> = JSON.parse(cached.result)
      secs.forEach((s, i) => { s.tone = scores[String(i)] ?? 0 })
      return
    } catch {
      // Corrupt cache row — fall through and recompute from the backend.
    }
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
  secs: SectionData[], level: GapLevel, reference: GapReference
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
  const corpus = await loadProjectCorpus({
    projectId: input.projectId,
    keywordListId: input.keywordListId,
    polarity: 'both',
  })
  const docs = corpus.docs
  const keywords = corpus.keywords

  const secs = await buildSections(corpus, docs, keywords)
  await fillSectionTones(input.projectId, secs)

  // keyword-level points: per (doc, keyword) freq + avg section tone
  const kwPoints: GapPoint[] = []
  {
    type Acc = { polarity: 1 | -1; freq: number; toneWeighted: number; text: string; documentId: string; documentLabel: string }
    const acc = new Map<string, Acc>()
    for (const s of secs) {
      for (const kw of keywords) {
        const terms = corpus.termsFor(kw)
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
    document: buildPoints(secs, 'document', input.reference),
    section: buildPoints(secs, 'section', input.reference),
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
