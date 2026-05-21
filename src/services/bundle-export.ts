/**
 * Paper-ready bundle export (US-C-07).
 *
 * Bundles the current Track output into a ZIP the researcher can drop
 * straight into a paper:
 *   chart.png       — current chart rendered as PNG
 *   methodology.md  — auto-generated configuration blurb
 *   data.csv        — pivoted year × series matrix
 *   documents.csv   — contributing documents with attributes
 *   per-document.csv (only when measure='score') — per-doc scores
 *
 * Saved via Electron's native file-save dialog. No backend round-trip
 * — everything composed client-side from the existing Track result
 * plus a snapshot of the rendered chart SVG.
 */

import JSZip from 'jszip'
import { selectAll } from './db'
import { stringifyCsv } from './csv'
import type {
  TrackResult,
  TrackMeasure,
  TrackTopic,
  TrackGroup,
} from './track'
import type { Project, KeywordList, ScoringRule } from '@/types/data'

export interface ExportContext {
  project: Project
  keywordList: KeywordList
  scoringRule: ScoringRule | null
  /** The rendered chart container (used to find the <svg> for PNG capture). */
  chartContainer: HTMLElement | null
  /** All inputs the user picked, so the methodology section can describe them. */
  topicLabel: string
  measure: TrackMeasure
  group: TrackGroup
  polarity: string
  yearMin?: number
  yearMax?: number
}

interface ProjectDocRow {
  id: string
  title: string | null
  filename: string
  year: number | null
  company: string | null
  sector: string | null
}

const PNG_PIXEL_SCALE = 2  // 2x for retina-ish quality

export async function exportPaperBundle(
  ctx: ExportContext,
  result: TrackResult
): Promise<{ filePath: string } | { cancelled: true }> {
  const electron = window.electron
  if (!electron) throw new Error('Electron API not available')

  // 1. Pick a save location.
  const filename = suggestFilename(ctx)
  const dialog = await electron.saveFileDialog({
    title: 'Export paper-ready bundle',
    defaultPath: filename,
    buttonLabel: 'Save bundle',
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  })
  if (dialog.canceled || !dialog.filePath) {
    return { cancelled: true }
  }

  // 2. Compose contents.
  const generatedAt = new Date().toISOString()

  const docs = await loadContributingDocuments(ctx.project.id)
  const methodology = composeMethodologyMarkdown(ctx, result, generatedAt, docs.length)
  const dataCsv = composeDataCsv(result)
  const documentsCsv = composeDocumentsCsv(docs)
  const perDocCsv = result.measure === 'score' && result.perDocument.length > 0
    ? composePerDocumentCsv(result)
    : null
  const chartPng = ctx.chartContainer ? await snapshotChartPng(ctx.chartContainer) : null

  // 3. Assemble the ZIP.
  const zip = new JSZip()
  zip.file('methodology.md', methodology)
  zip.file('data.csv', dataCsv)
  zip.file('documents.csv', documentsCsv)
  if (perDocCsv) zip.file('per-document.csv', perDocCsv)
  if (chartPng) zip.file('chart.png', chartPng)

  const blob = await zip.generateAsync({ type: 'arraybuffer' })

  // 4. Write to disk.
  await electron.writeFile(dialog.filePath, blob)

  return { filePath: dialog.filePath }
}

// ---------------------------------------------------------------------------
// Filename + composition helpers
// ---------------------------------------------------------------------------

function suggestFilename(ctx: ExportContext): string {
  const projectSlug = ctx.project.name
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60)
  const datestamp = new Date().toISOString().slice(0, 10)
  const measureSlug = ctx.measure
  return `${projectSlug || 'project'}-track-${measureSlug}-${datestamp}.zip`
}

function composeMethodologyMarkdown(
  ctx: ExportContext,
  result: TrackResult,
  generatedAt: string,
  contributingDocCount: number
): string {
  const lines: string[] = []
  lines.push(`# ${ctx.project.name}`)
  lines.push('')
  lines.push(`Track export generated ${generatedAt} by Document Lens.`)
  lines.push('')
  lines.push('## Configuration')
  lines.push('')
  lines.push(`- **Framework / keyword list**: ${ctx.keywordList.name}`)
  if (ctx.scoringRule) {
    lines.push(`- **Scoring rule**: ${ctx.scoringRule.name}`)
  }
  lines.push(`- **Topic**: ${ctx.topicLabel}`)
  lines.push(`- **Measure**: ${measureLabel(ctx.measure)}`)
  lines.push(`- **Overlay**: ${groupLabel(ctx.group)}`)
  lines.push(`- **Polarity**: ${ctx.polarity}`)
  const yearLabel = result.yearRange
    ? `${ctx.yearMin ?? result.yearRange.min}–${ctx.yearMax ?? result.yearRange.max}`
    : 'all available'
  lines.push(`- **Year range**: ${yearLabel}`)
  lines.push(`- **Contributing documents**: ${result.totalDocs} of ${contributingDocCount} in project`)
  if (result.yearUnknown.documentCount > 0) {
    lines.push(
      `- **Year unknown**: ${result.yearUnknown.documentCount} document(s) excluded from the trend ` +
      `(${result.yearUnknown.matchCount} match(es) not counted). Set their year on the Library page to include them.`
    )
  }
  lines.push('')

  lines.push('## Series')
  lines.push('')
  for (const s of result.series) {
    const points = s.points.length
    const min = s.points.length > 0 ? Math.min(...s.points.map((p) => p.value)) : 0
    const max = s.points.length > 0 ? Math.max(...s.points.map((p) => p.value)) : 0
    lines.push(`- **${s.name}**: ${points} point(s), range ${formatRange(min, max, ctx.measure)}`)
  }
  lines.push('')

  if (result.scoreFallback) {
    lines.push('## Score fallback notice')
    lines.push('')
    lines.push(
      'The Wedding Cake Score requires per-section Function classification. Not all documents in this project are classified yet, so the **score values fall back to the v1 Pillar coverage prerequisite** — they reflect how many required pillars each document mentions positively, not the full Wedding Cake Level. Run Function classification on the Setup tab to upgrade.'
    )
    lines.push('')
  }

  lines.push('## Honesty about ML signals')
  lines.push('')
  lines.push(
    `Counts and coverage percentages are deterministic regex matches over extracted text — same input always gives the same output. Score values follow the project's active scoring rule and are deterministic given the underlying tag data. ` +
    `Function classification (when used) comes from sentence-embedding similarity and is approximate; treat it as a strong signal, not a precise category assignment.`
  )
  lines.push('')

  lines.push('## Files in this bundle')
  lines.push('')
  lines.push('- `methodology.md` — this file')
  lines.push('- `chart.png` — the rendered trend chart')
  lines.push('- `data.csv` — year × series matrix used to draw the chart')
  lines.push('- `documents.csv` — contributing documents with their attributes')
  if (result.measure === 'score' && result.perDocument.length > 0) {
    lines.push('- `per-document.csv` — per-document score values (the scatter dots)')
  }
  lines.push('')

  return lines.join('\n')
}

function composeDataCsv(result: TrackResult): string {
  // Year axis: the union of years across all series.
  const yearSet = new Set<number>()
  for (const s of result.series) for (const p of s.points) yearSet.add(p.year)
  const years = Array.from(yearSet).sort((a, b) => a - b)

  const header: Array<string> = ['year']
  for (const s of result.series) header.push(s.name)
  header.push('document_count')

  const rows: Array<Array<string | number | null>> = [header]
  for (const year of years) {
    const row: Array<string | number | null> = [year]
    for (const s of result.series) {
      const pt = s.points.find((p) => p.year === year)
      row.push(pt ? formatValueForCsv(pt.value, result.measure) : '')
    }
    // documentCount is the same across series for a given year (the inner
    // loop sums across the same docs), so just take series[0]'s value.
    row.push(result.series[0]?.points.find((p) => p.year === year)?.documentCount ?? 0)
    rows.push(row)
  }
  return stringifyCsv(rows)
}

async function loadContributingDocuments(projectId: string): Promise<ProjectDocRow[]> {
  return selectAll<ProjectDocRow>('bundleExport.projectDocs', [projectId])
}

function composeDocumentsCsv(docs: ProjectDocRow[]): string {
  const rows: Array<Array<string | number | null>> = [
    ['title', 'filename', 'year', 'company', 'sector'],
  ]
  for (const d of docs) {
    rows.push([d.title ?? d.filename, d.filename, d.year, d.company, d.sector])
  }
  return stringifyCsv(rows)
}

function composePerDocumentCsv(result: TrackResult): string {
  const rows: Array<Array<string | number | null>> = [
    ['year', 'document', 'score', 'polarity'],
  ]
  // Sort: year asc, then title.
  const sorted = [...result.perDocument].sort(
    (a, b) => a.year - b.year || a.title.localeCompare(b.title)
  )
  for (const p of sorted) {
    rows.push([p.year, p.title, formatValueForCsv(p.value, 'score'), p.polarity])
  }
  return stringifyCsv(rows)
}

function formatValueForCsv(value: number, measure: TrackMeasure): number | string {
  if (measure === 'coverage-percent') return Number(value.toFixed(2))
  if (measure === 'score') return Number(value.toFixed(3))
  return value
}

function formatRange(min: number, max: number, measure: TrackMeasure): string {
  const fmt = (v: number): string => {
    if (measure === 'coverage-percent') return `${v.toFixed(1)}%`
    if (measure === 'score') return v.toFixed(2)
    return v.toLocaleString()
  }
  if (min === max) return fmt(min)
  return `${fmt(min)}–${fmt(max)}`
}

function measureLabel(m: TrackMeasure): string {
  if (m === 'match-count') return 'Match count'
  if (m === 'coverage-percent') return 'Coverage % (documents with ≥1 match)'
  return 'Score (active rule per year)'
}

function groupLabel(g: TrackGroup): string {
  if (g === 'none') return 'None (single line)'
  if (g === 'polarity') return 'Polarity (positive vs counter)'
  if (g === 'company') return 'Company (one line per company)'
  return 'Sector (one line per sector)'
}

// ---------------------------------------------------------------------------
// SVG -> PNG snapshot
// ---------------------------------------------------------------------------

/**
 * Capture the chart's rendered SVG as a PNG ArrayBuffer.
 *
 * Recharts renders a single root <svg> inside the ResponsiveContainer.
 * We serialize that SVG to a string, render it onto a canvas via an
 * Image, and read the canvas back as a PNG blob → ArrayBuffer.
 *
 * Returns null on failure (the bundle still ships, just without the
 * chart image).
 */
async function snapshotChartPng(container: HTMLElement): Promise<ArrayBuffer | null> {
  const svg = container.querySelector('svg')
  if (!svg) return null

  // Get the SVG's intrinsic size from its bounding box.
  const rect = svg.getBoundingClientRect()
  const width = Math.max(1, Math.floor(rect.width))
  const height = Math.max(1, Math.floor(rect.height))

  // Clone and ensure xmlns is present so the serialized string is valid
  // standalone XML (recharts sometimes omits xmlns when embedded in HTML).
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }
  // Add an explicit white background so the PNG isn't transparent.
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', '0')
  bg.setAttribute('y', '0')
  bg.setAttribute('width', String(width))
  bg.setAttribute('height', String(height))
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  const xml = new XMLSerializer().serializeToString(clone)
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`

  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load SVG into Image'))
    img.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = width * PNG_PIXEL_SCALE
  canvas.height = height * PNG_PIXEL_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(PNG_PIXEL_SCALE, PNG_PIXEL_SCALE)
  ctx.drawImage(img, 0, 0, width, height)

  return new Promise<ArrayBuffer | null>((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve(null)
          return
        }
        resolve(await blob.arrayBuffer())
      },
      'image/png',
      0.95
    )
  })
}

// Re-exports so callers don't need to import TrackTopic separately.
export type { TrackTopic }
