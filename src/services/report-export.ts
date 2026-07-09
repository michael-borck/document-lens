/**
 * Full-project DOCX report — the "export everything" scope (scope #2 in
 * docs/design/focus-auto-research-mode.md). Assembles the deterministic,
 * reproducible signals into one Word document a researcher can drop into a
 * write-up: document inventory, Wedding Cake scores (X/4 tier + X/12 pillar
 * coverage), and the substance signals.
 *
 * Every number here is computed deterministically from the same services the
 * on-screen views use — the report is a container, not a new analysis.
 *
 * Charts are NOT embedded yet: capturing every view's chart needs off-screen
 * rendering plumbing (a follow-on). Tables are what most write-ups need first.
 */

import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx'
import { selectAll } from './db'
import { rowToDocument, type DocumentRow } from './_shared/document-row'
import { evaluateScore } from './scoring'
import { computeCompare, type CompareMetric } from './compare'
import { confidenceLabel } from './substance'
import type { DocScore } from './_shared/wedding-cake'
import type { ScoringRule } from '@/types/data'

export interface ReportInput {
  projectId: string
  projectName: string
  keywordListId: string
  keywordListName: string
  scoringRule: ScoringRule | null
  /** Human-readable timestamp, supplied by the caller (renderer). */
  generatedAt: string
}

function cell(text: string | number, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold, size: 18 })] })],
  })
}

function makeTable(headers: string[], rows: Array<Array<string | number>>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) })),
    ],
  })
}

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1 })
}

function muted(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, italics: true, color: '666666', size: 18 })] })
}

/** Build the report and return it as a .docx Blob (Packer.toBlob). */
export async function generateProjectReport(input: ReportInput): Promise<Blob> {
  const docs = (await selectAll<DocumentRow>('documents.byProjectOrdered', [input.projectId])).map(rowToDocument)

  // Substance signals — one computeCompare pass per metric, keyed by document.
  const substanceMetrics: CompareMetric[] = ['repetition', 'diversity', 'intensity', 'evidence-reuse']
  const valueByDocMetric = new Map<string, Record<string, number>>()
  const confidenceByDoc = new Map<string, number>()
  for (const metric of substanceMetrics) {
    const result = await computeCompare({
      projectId: input.projectId,
      keywordListId: input.keywordListId,
      metric,
      polarity: 'positive',
      group: 'none',
    })
    for (const p of result.points) {
      const rec = valueByDocMetric.get(p.documentId) ?? {}
      rec[metric] = p.value
      valueByDocMetric.set(p.documentId, rec)
      if (p.confidence !== undefined) confidenceByDoc.set(p.documentId, p.confidence)
    }
  }

  // Scores (optional — only when a scoring rule is active and computable).
  let scoresByDoc: Map<string, DocScore> | null = null
  let scoreMode = ''
  if (input.scoringRule) {
    try {
      const evaluation = await evaluateScore({
        projectId: input.projectId,
        keywordListId: input.keywordListId,
        definition: input.scoringRule.definition,
        polarity: 'positive',
      })
      scoresByDoc = evaluation.perDocument
      scoreMode = evaluation.mode
    } catch {
      scoresByDoc = null // scoring not computable (e.g. classification incomplete)
    }
  }

  const children: Array<Paragraph | Table> = []

  children.push(new Paragraph({ text: input.projectName, heading: HeadingLevel.TITLE }))
  children.push(muted(`Document Lens report · generated ${input.generatedAt}`))

  children.push(heading('Configuration'))
  children.push(new Paragraph(`Keyword list: ${input.keywordListName}`))
  children.push(new Paragraph(`Documents: ${docs.length}`))
  if (input.scoringRule) {
    children.push(new Paragraph(`Scoring rule: ${input.scoringRule.name}${scoreMode ? ` (${scoreMode} mode)` : ''}`))
  }
  children.push(muted('All figures below are computed deterministically and are reproducible from the same inputs.'))

  children.push(heading('Document inventory'))
  children.push(makeTable(
    ['Title', 'Year', 'Company', 'Sector', 'Type', 'Size', 'Pages', 'Words'],
    docs.map((d) => [
      d.title ?? d.filename,
      d.year ?? '',
      d.company ?? '',
      d.sector ?? '',
      d.type ?? '',
      d.companySize ?? '',
      d.pageCount ?? '',
      d.wordCount ?? '',
    ]),
  ))

  if (scoresByDoc) {
    children.push(heading('Wedding Cake scores'))
    children.push(muted('Tier = functions delivering every required pillar (X/4). Pillar coverage = partial credit summed across functions (X/12) — separates broad-but-shallow from empty.'))
    children.push(makeTable(
      ['Document', 'Tier', 'Pillar coverage', '%'],
      docs.map((d) => {
        const s = scoresByDoc!.get(d.id)
        return [
          d.title ?? d.filename,
          s ? `${s.score} / ${s.max}` : '—',
          s?.pillarsCovered !== undefined && s?.pillarsPossible !== undefined ? `${s.pillarsCovered} / ${s.pillarsPossible}` : '—',
          s?.overallRatio !== undefined ? `${Math.round(s.overallRatio * 100)}%` : '—',
        ]
      }),
    ))
  }

  children.push(heading('Substance signals'))
  children.push(muted('Repetition = matches ÷ unique keyword. Diversity = keyword breadth. Intensity = matches / 1k words. Evidence reuse = share of matches on multi-pillar keywords. Confidence reflects evidence volume — discount low-confidence rows.'))
  children.push(makeTable(
    ['Document', 'Repetition', 'Diversity', 'Intensity', 'Evidence reuse', 'Confidence'],
    docs.map((d) => {
      const rec = valueByDocMetric.get(d.id) ?? {}
      const conf = confidenceByDoc.get(d.id)
      const pct = (v: number | undefined) => (v !== undefined ? `${Math.round(v * 100)}%` : '—')
      const num = (v: number | undefined) => (v !== undefined ? v.toFixed(1) : '—')
      return [
        d.title ?? d.filename,
        num(rec['repetition']),
        pct(rec['diversity']),
        num(rec['intensity']),
        pct(rec['evidence-reuse']),
        conf !== undefined ? confidenceLabel(conf) : '—',
      ]
    }),
  ))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}
