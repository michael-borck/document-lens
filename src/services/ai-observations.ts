/**
 * AI observations — an OPTIONAL, clearly-flagged interpretation layer over the
 * deterministic signals. We feed the model the numbers the tool computed (plus,
 * for a single document, its text) and ask for notable patterns / outliers and
 * where to look next.
 *
 * This is the only non-deterministic, non-repeatable feature in the app. The UI
 * always flags its output as AI-generated. The model never computes the
 * signals — it only interprets the ones we give it.
 */

import { computeCompare, type CompareMetric } from './compare'
import { evaluateScore } from './scoring'
import { selectAll } from './db'
import { rowToDocument, type DocumentRow } from './_shared/document-row'
import { confidenceLabel } from './substance'
import { chat as aiChat } from './ai'
import type { ScoringRule } from '@/types/data'

const SYSTEM_PROMPT = `You are a careful research assistant helping analyse corporate sustainability and annual reports. You are given DETERMINISTIC signals that a tool computed (not you), and sometimes document text. Surface the most INTERESTING observations, patterns, and outliers, and suggest where the researcher should focus next.

Rules:
- Base every observation strictly on the provided data. Do NOT invent numbers or facts.
- Call out low-confidence signals and be explicit about uncertainty.
- Be concise: a one-line intro, then 5–8 short bullet observations, then 1–2 "where to look next" suggestions.
- You are an initial interpretation aid, not a verdict.`

export interface ObserveResult {
  ok: boolean
  text?: string
  provider?: string
  model?: string
  error?: string
}

export interface ObserveProjectInput {
  projectId: string
  projectName: string
  keywordListId: string
  keywordListName: string
  scoringRule: ScoringRule | null
}

interface SignalRow {
  id: string
  title: string
  year: number | null
  company: string | null
  size: string | null
  scorePct: number | null
  repetition: number | undefined
  evidenceReuse: number | undefined
  coverageSpread: number | undefined
  confidence: number | undefined
}

async function gatherRows(
  projectId: string,
  keywordListId: string,
  scoringRule: ScoringRule | null
): Promise<{ rows: SignalRow[]; docs: ReturnType<typeof rowToDocument>[] }> {
  const docs = (await selectAll<DocumentRow>('documents.byProjectOrdered', [projectId])).map(rowToDocument)

  const metrics: CompareMetric[] = ['repetition', 'evidence-reuse', 'coverage-spread']
  const byDoc = new Map<string, Record<string, number>>()
  const conf = new Map<string, number>()
  for (const metric of metrics) {
    const result = await computeCompare({
      projectId,
      keywordListId,
      metric,
      polarity: 'positive',
      group: 'none',
      scoringRule: scoringRule?.definition,
    })
    for (const p of result.points) {
      const rec = byDoc.get(p.documentId) ?? {}
      rec[metric] = p.value
      byDoc.set(p.documentId, rec)
      if (p.confidence !== undefined) conf.set(p.documentId, p.confidence)
    }
  }

  const scoreByDoc = new Map<string, number>()
  if (scoringRule) {
    try {
      const ev = await evaluateScore({ projectId, keywordListId, definition: scoringRule.definition, polarity: 'positive' })
      for (const [id, s] of ev.perDocument) {
        if (s.overallRatio !== undefined) scoreByDoc.set(id, s.overallRatio)
      }
    } catch {
      /* scoring not computable — leave scores blank */
    }
  }

  const rows: SignalRow[] = docs.map((d) => ({
    id: d.id,
    title: d.title ?? d.filename,
    year: d.year,
    company: d.company,
    size: d.companySize,
    scorePct: scoreByDoc.has(d.id) ? Math.round((scoreByDoc.get(d.id) ?? 0) * 100) : null,
    repetition: byDoc.get(d.id)?.['repetition'],
    evidenceReuse: byDoc.get(d.id)?.['evidence-reuse'],
    coverageSpread: byDoc.get(d.id)?.['coverage-spread'],
    confidence: conf.get(d.id),
  }))
  return { rows, docs }
}

const pct = (v: number | undefined) => (v !== undefined ? `${Math.round(v * 100)}` : '')
const num = (v: number | undefined) => (v !== undefined ? v.toFixed(1) : '')

function formatRows(rows: SignalRow[]): string {
  const header = 'Title\tYear\tCompany\tSize\tScore%\tRepetition\tEvidenceReuse%\tCoverageSpread%\tConfidence'
  const lines = rows.map((r) =>
    [
      r.title,
      r.year ?? '',
      r.company ?? '',
      r.size ?? '',
      r.scorePct ?? '',
      num(r.repetition),
      pct(r.evidenceReuse),
      pct(r.coverageSpread),
      r.confidence !== undefined ? confidenceLabel(r.confidence) : '',
    ].join('\t')
  )
  return [header, ...lines].join('\n')
}

const GLOSSARY =
  'Glossary — Score% = pillar coverage (X/12, partial credit across functions). ' +
  'Repetition = matches per unique keyword (higher = more repetitive language). ' +
  'EvidenceReuse% = share of matches on keywords tagged to multiple pillars (higher = same evidence counted toward many pillars). ' +
  'CoverageSpread% = fraction of the pillar×function matrix filled. Confidence reflects evidence volume — discount low-confidence rows.'

export async function observeProject(input: ObserveProjectInput): Promise<ObserveResult> {
  const { rows } = await gatherRows(input.projectId, input.keywordListId, input.scoringRule)
  if (rows.length === 0) return { ok: false, error: 'No documents in this project to analyse.' }
  const user =
    `Project: ${input.projectName}\nKeyword list: ${input.keywordListName}\nDocuments: ${rows.length}\n\n` +
    `Per-document signals (tab-separated):\n${formatRows(rows)}\n\n${GLOSSARY}\n\n` +
    `Give your observations across the project — outliers, patterns, and where to focus.`
  return aiChat(SYSTEM_PROMPT, user, 1500)
}

export interface ObserveDocumentInput extends ObserveProjectInput {
  documentId: string
}

export async function observeDocument(input: ObserveDocumentInput): Promise<ObserveResult> {
  const { rows, docs } = await gatherRows(input.projectId, input.keywordListId, input.scoringRule)
  const row = rows.find((r) => r.id === input.documentId)
  const doc = docs.find((d) => d.id === input.documentId)
  if (!row || !doc) return { ok: false, error: 'Document not found in this project.' }

  const text = (doc.extractedText ?? '').slice(0, 12000)
  const user =
    `Document: ${row.title}${row.year ? ` (${row.year})` : ''}${row.company ? ` — ${row.company}` : ''}\n\n` +
    `Its signals (tab-separated):\n${formatRows([row])}\n\n${GLOSSARY}\n\n` +
    (text ? `Document text (truncated):\n"""\n${text}\n"""\n\n` : '') +
    `Give observations about THIS document — what stands out in its signals, and (if text is provided) whether the language supports or overstates the signals. Note any sign of repeated/boilerplate evidence.`
  return aiChat(SYSTEM_PROMPT, user, 1500)
}
