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
  ImageRun,
} from 'docx'
import { barChartSvg, type SvgChart, type BarItem } from './_shared/svg-chart'
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

/**
 * Rasterise a chart SVG to PNG bytes via an offscreen canvas (renderer only —
 * uses Image/canvas). Returns null on any failure so a chart can be skipped
 * without failing the whole report.
 */
async function svgToPng(chart: SvgChart): Promise<Uint8Array | null> {
  try {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.svg)}`
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG failed to load'))
      img.src = dataUrl
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = chart.width * scale
    canvas.height = chart.height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, chart.width, chart.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

async function chartParagraph(chart: SvgChart): Promise<Paragraph | null> {
  const png = await svgToPng(chart)
  if (!png) return null
  return new Paragraph({
    children: [new ImageRun({ type: 'png', data: png, transformation: { width: chart.width, height: chart.height } })],
  })
}

/** Build a ranked bar chart from a per-document value getter (desc, top 15). */
function rankedChart(
  title: string,
  docs: Array<{ id: string; title: string | null; filename: string }>,
  getValue: (docId: string) => number | undefined,
  transform: (v: number) => number,
  valueSuffix?: string
): SvgChart | null {
  const items: BarItem[] = docs
    .map((d) => ({ label: d.title ?? d.filename, value: getValue(d.id) }))
    .filter((x): x is { label: string; value: number } => x.value !== undefined && x.value > 0)
    .map((x) => ({ label: x.label, value: transform(x.value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15)
  return items.length > 0 ? barChartSvg(title, items, { valueSuffix }) : null
}

/** Build the report and return it as a .docx Blob (Packer.toBlob). */
export async function generateProjectReport(input: ReportInput): Promise<Blob> {
  const docs = (await selectAll<DocumentRow>('documents.byProjectOrdered', [input.projectId])).map(rowToDocument)

  // Substance signals — one computeCompare pass per metric, keyed by document.
  const substanceMetrics: CompareMetric[] = ['repetition', 'diversity', 'intensity', 'evidence-reuse', 'coverage-spread']
  const valueByDocMetric = new Map<string, Record<string, number>>()
  const confidenceByDoc = new Map<string, number>()
  for (const metric of substanceMetrics) {
    const result = await computeCompare({
      projectId: input.projectId,
      keywordListId: input.keywordListId,
      metric,
      polarity: 'positive',
      group: 'none',
      // coverage-spread needs the rule's pillar + function axes.
      scoringRule: input.scoringRule?.definition,
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

  // Charts — ranked bar charts built directly from the data (deterministic).
  const round1 = (v: number) => Math.round(v * 10) / 10
  const pct = (v: number) => Math.round(v * 100)
  const charts: Array<SvgChart | null> = [
    scoresByDoc
      ? rankedChart('Pillar coverage (X/12 %)', docs, (id) => scoresByDoc!.get(id)?.overallRatio, pct, '%')
      : null,
    rankedChart('Repetition (matches ÷ unique keyword)', docs, (id) => valueByDocMetric.get(id)?.['repetition'], round1),
    rankedChart('Evidence reuse (multi-pillar %)', docs, (id) => valueByDocMetric.get(id)?.['evidence-reuse'], pct, '%'),
  ]
  const presentCharts = charts.filter((c): c is SvgChart => c !== null)
  if (presentCharts.length > 0) {
    children.push(heading('Charts'))
    for (const chart of presentCharts) {
      const para = await chartParagraph(chart)
      if (para) children.push(para)
    }
  }

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
  children.push(muted('Repetition = matches ÷ unique keyword. Diversity = keyword breadth. Intensity = matches / 1k words. Evidence reuse = share of matches on multi-pillar keywords. Coverage spread = fraction of the pillar×function matrix filled. Confidence reflects evidence volume — discount low-confidence rows.'))
  children.push(makeTable(
    ['Document', 'Repetition', 'Diversity', 'Intensity', 'Evidence reuse', 'Coverage spread', 'Confidence'],
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
        pct(rec['coverage-spread']),
        conf !== undefined ? confidenceLabel(conf) : '—',
      ]
    }),
  ))

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}
