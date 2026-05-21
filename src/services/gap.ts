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
