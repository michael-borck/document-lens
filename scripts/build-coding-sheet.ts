/**
 * Build a coding sheet from reports, a keyword list and a profile.
 *
 * Headless on purpose: no Tauri, no database. It takes paragraphs from the
 * engine's /layout/paragraphs, builds rows with the app's matching seam
 * (src/services/coding-sheet), and asks the engine to write the workbooks.
 *
 * Usage:
 *   node build-coding-sheet.mjs \
 *     --engine http://127.0.0.1:8765 \
 *     --keywords PU_v11.4_env_keywords.csv \
 *     --profile coding-sheet-profile-v11.json \
 *     --reports reports-round2.json \
 *     --template PU_coding_sheet_v11_TEMPLATE.xlsx \
 *     --out ./delivery \
 *     --coders "Burbridge,Naef,Bhattacharjee,Tan" \
 *     --figures-out ./figures.csv
 *
 * reports JSON: [{ code, university, report, year, path }]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

import {
  buildCodingSheetRows,
  type CodingKeyword,
  type CodingReport,
  type CodingRow,
  type FigureRow,
  type Goal,
} from '../src/services/coding-sheet'

interface Options {
  engine: string
  keywords: string
  profile: string
  reports: string
  template: string
  out: string
  coders: string[]
  figuresOut?: string
  pageMapOut?: string
  sheetVersion: string
  keywordVersion: string
  batch: string
}

interface ReportSpec {
  code: string
  university: string
  report: string
  year: number
  path: string
}

interface ParagraphsResponse {
  page_count: number
  paragraph_count: number
  dropped: number
  paragraphs: Array<{ page_number: number; start_offset: number; text: string }>
  page_map: Array<{
    pdf_page: number
    printed_page: number | null
    label: string | null
    source: string
  }>
}

interface BuildResponse {
  files: Array<{ coder: string; path: string; rows: number }>
  row_count: number
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) fail(`Unexpected argument: ${key}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) fail(`Missing value for ${key}`)
    values.set(key.slice(2), value)
    i += 1
  }
  const required = ['engine', 'keywords', 'profile', 'reports', 'template', 'out', 'coders']
  for (const key of required) {
    if (!values.has(key)) fail(`Missing --${key}`)
  }
  const coders = (values.get('coders') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (coders.length === 0) fail('--coders is empty')
  return {
    engine: (values.get('engine') ?? '').replace(/\/$/, ''),
    keywords: values.get('keywords') ?? '',
    profile: values.get('profile') ?? '',
    reports: values.get('reports') ?? '',
    template: values.get('template') ?? '',
    out: values.get('out') ?? '',
    coders,
    figuresOut: values.get('figures-out'),
    pageMapOut: values.get('page-map-out'),
    sheetVersion: values.get('sheet-version') ?? 'v11',
    keywordVersion: values.get('keyword-version') ?? 'v11.4',
    batch: values.get('batch') ?? 'R2',
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  }
  return rows
}

function loadKeywords(path: string): CodingKeyword[] {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
  if (!header) fail('Keyword CSV is empty')
  const index = (name: string) => header.findIndex((cell) => cell.trim() === name)
  const typeAt = index('type')
  const sdgAt = index('sdg')
  const termAt = index('keyword')
  const modeAt = index('mode')
  const excludeAt = index('exclude_before')
  if ([typeAt, sdgAt, termAt, modeAt].some((i) => i < 0)) {
    fail('Keyword CSV needs columns: type, sdg, keyword, mode')
  }
  return rows.map((row) => {
    const mode = (row[modeAt] ?? 'prefix').trim()
    if (mode !== 'prefix' && mode !== 'word' && mode !== 'phrase') {
      fail(`Unknown mode ${mode} for ${row[termAt]}`)
    }
    const exclude = excludeAt >= 0 ? (row[excludeAt] ?? '').trim() : ''
    return {
      type: (row[typeAt] ?? '').trim(),
      sdg: (row[sdgAt] ?? '').trim(),
      keyword: (row[termAt] ?? '').trim(),
      mode,
      excludesBefore: exclude ? exclude.split('|').map((s) => s.trim()) : undefined,
    }
  })
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) fail(`${url} -> ${response.status}: ${text.slice(0, 400)}`)
  return JSON.parse(text) as T
}

function slug(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'coder'
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const keywords = loadKeywords(options.keywords)
  const profile = JSON.parse(readFileSync(options.profile, 'utf8')) as unknown
  const specs = JSON.parse(readFileSync(options.reports, 'utf8')) as ReportSpec[]

  const rows: CodingRow[] = []
  const figures: FigureRow[] = []
  const firedTerms = new Set<string>()
  const perGoal = new Map<Goal, number>()
  const perReport: Array<{ code: string; rows: number; paragraphs: number; dropped: number }> = []
  const pageMapLines = ['report,pdf_page,printed_page,label,source']

  for (const spec of specs) {
    const extracted = await postJson<ParagraphsResponse>(`${options.engine}/layout/paragraphs`, {
      file_path: spec.path,
    })
    if (extracted.dropped > 0) {
      console.error(`note: ${spec.code} dropped ${extracted.dropped} unanchored blocks`)
    }
    const printedPage: Record<number, number | null> = {}
    for (const entry of extracted.page_map) {
      printedPage[entry.pdf_page] = entry.printed_page
      pageMapLines.push(
        [spec.code, entry.pdf_page, entry.printed_page ?? '', entry.label ?? '', entry.source]
          .join(',')
      )
    }

    const report: CodingReport = {
      code: spec.code,
      university: spec.university,
      report: spec.report,
      year: spec.year,
      paragraphs: extracted.paragraphs.map((p) => ({
        page: p.page_number,
        startOffset: p.start_offset,
        text: p.text,
      })),
      printedPage,
    }
    const built = buildCodingSheetRows(report, keywords)
    rows.push(...built.rows)
    figures.push(...built.figures)
    for (const term of built.firedTerms) firedTerms.add(term)
    for (const row of built.rows) perGoal.set(row.primary_value, (perGoal.get(row.primary_value) ?? 0) + 1)
    perReport.push({
      code: spec.code,
      rows: built.rows.length,
      paragraphs: extracted.paragraph_count,
      dropped: extracted.dropped,
    })
  }

  const copies = options.coders.map((coder) => ({
    coder,
    filename: `PU_coding_sheet_${options.sheetVersion}_${options.batch}_${slug(coder)}.xlsx`,
  }))

  const built = await postJson<BuildResponse>(`${options.engine}/coding-sheet/build`, {
    template_path: options.template,
    output_dir: options.out,
    profile,
    rows,
    copies,
    sheet_version: options.sheetVersion,
    keyword_list_version: options.keywordVersion,
    batch_label: options.batch,
  })

  if (options.pageMapOut) {
    writeFileSync(options.pageMapOut, `${pageMapLines.join('\n')}\n`, 'utf8')
  }

  if (options.figuresOut) {
    const lines = ['claim_id,has_figure', ...figures.map((f) => `${f.claim_id},${f.has_figure}`)]
    writeFileSync(options.figuresOut, `${lines.join('\n')}\n`, 'utf8')
  }

  const zeroHit = keywords
    .map((keyword) => keyword.keyword)
    .filter((term) => !firedTerms.has(term))

  console.log(`\nrows: ${rows.length}`)
  for (const report of perReport) {
    console.log(
      `  ${report.code}: ${report.rows} rows from ${report.paragraphs} paragraphs (${report.dropped} dropped)`
    )
  }
  console.log(
    `goals: ${[...perGoal.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([goal, count]) => `${goal}=${count}`)
      .join(' ')}`
  )
  console.log(`figures: ${figures.length}`)
  console.log(`keywords with no hit: ${zeroHit.length}${zeroHit.length ? ` (${zeroHit.join(', ')})` : ''}`)
  for (const file of built.files) console.log(`wrote ${file.path} (${file.rows} rows)`)
  console.log(`template: ${basename(options.template)}`)
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error))
})
