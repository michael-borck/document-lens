/**
 * Calibration harness (ADR-0028 companion to
 * research-context/calibration-protocol.md).
 *
 * Reads one or more filled coding sheets (.xlsx, the researchers' v9
 * instrument) and the app's per-mention export (ADR-0031 mentions.csv),
 * then emits the agreement report: inter-coder reliability (Krippendorff's
 * α per axis, framing ordinal) and tool-vs-consensus precision/recall.
 *
 *   node --experimental-strip-types scripts/calibrate.mjs \
 *     --sheet coderA.xlsx --sheet coderB.xlsx::Sonja \
 *     [--export mentions.csv] [--out agreement-report.md]
 *
 * Everything is derived from the sheets — no app state is read. The
 * report is markdown; human-readable by design because the researchers
 * are the audience (find/judge split: the tool computes, they interpret).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { readXlsxFile } from './lib/xlsx.mjs'
import { krippendorffAlpha } from '../src/services/_shared/krippendorff.ts'
import sustainabilityKeywords from '../src/data/sustainability-keywords.json' with { type: 'json' }
import v9SearchTerms from '../src/data/v9-search-terms.json' with { type: 'json' }

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
function argValue(flag) {
  const i = args.indexOf(flag)
  return i === -1 ? null : args[i + 1] ?? null
}
const sheetArgs = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sheet') sheetArgs.push(args[++i])
}
const exportCsvPath = argValue('--export')
const outPath = argValue('--out')

if (sheetArgs.length === 0) {
  console.error('Usage: node --experimental-strip-types scripts/calibrate.mjs --sheet <file.xlsx[:coder]> [--sheet ...] [--export mentions.csv] [--out report.md]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Passage/document keys must survive cross-coder whitespace noise. */
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/** 'SDG 13 — Climate Action' / '13' / '13.0' → '13'. */
function sdgKey(raw) {
  const digits = String(raw ?? '').match(/\d+/)
  return digits ? String(Number(digits[0])) : norm(raw)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Coding-sheet ingestion
// ---------------------------------------------------------------------------

// The sheet tab whose header carries the coding columns (by name when the
// template holds, else the largest non-infrastructure sheet).
const INFRA_SHEETS = new Set(['dashboard', 'legend', 'lists', 'delivery', 'search terms'])

function pickCodingSheet(wb) {
  const named = wb.sheetNames.find((n) => norm(n) === 'coding sheet')
  if (named) return named
  let best = null
  let bestRows = -1
  for (const name of wb.sheetNames) {
    if (INFRA_SHEETS.has(norm(name))) continue
    const rows = wb.sheet(name)
    if (rows.length > bestRows) {
      best = name
      bestRows = rows.length
    }
  }
  return best
}

function findHeaderRow(rows) {
  return rows.findIndex((r) => r.some((c) => norm(c) === 'sdg') && r.some((c) => norm(c) === 'passage'))
}

const AXIS_COLUMNS = {
  relevance: 'relevance',
  framing: 'framing',
  domain: 'domain',
  prominence: 'prominence',
  type: 'type',
}

const coders = [] // { coder, rows: [unitKey → {axis → value}] }
const stemUsage = new Map() // norm(stem) → Set<coder>

for (const sheetArg of sheetArgs) {
  const [path, coderOverride] = sheetArg.split('::')
  const coder = coderOverride ?? basename(path).replace(/\.(xlsx|xls)$/i, '')
  const wb = readXlsxFile(path)
  const sheetName = pickCodingSheet(wb)
  const rows = wb.sheet(sheetName)
  const headerIdx = findHeaderRow(rows)
  if (headerIdx === -1) {
    console.error(`[calibrate] ${coder}: no coding header row found in "${sheetName}" — skipping`)
    continue
  }
  const header = rows[headerIdx].map(norm)
  const col = (name) => header.indexOf(name)

  const docCol = col('doc') >= 0 ? col('doc') : col('university')
  const sdgCol = col('sdg')
  const wordCol = col('word')
  const passageCol = col('passage')
  if (passageCol === -1 || sdgCol === -1) {
    console.error(`[calibrate] ${coder}: missing SDG/passage columns — skipping`)
    continue
  }

  const units = new Map()
  let rowCount = 0
  for (const row of rows.slice(headerIdx + 1)) {
    const passage = row[passageCol] ?? ''
    const sdg = sdgKey(row[sdgCol])
    if (!norm(passage) || !sdg) continue
    const doc = docCol >= 0 ? row[docCol] : ''
    const unitKey = `${norm(doc)}|${sdg}|${norm(passage)}`
    const values = {}
    for (const [axis, colName] of Object.entries(AXIS_COLUMNS)) {
      const c = col(colName)
      if (c >= 0 && norm(row[c]) !== '') values[axis] = norm(row[c])
    }
    units.set(unitKey, values)
    rowCount++

    const stem = norm(row[wordCol] ?? '')
    if (stem) {
      if (!stemUsage.has(stem)) stemUsage.set(stem, new Set())
      stemUsage.get(stem).add(coder)
    }
  }
  coders.push({ coder, units, rowCount, sheetName })
  console.error(`[calibrate] ${coder}: ${rowCount} coded rows from "${sheetName}" (${units.size} units)`)
}

if (coders.length === 0) {
  console.error('[calibrate] no usable coding sheets — nothing to do')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Unit alignment + ICR
// ---------------------------------------------------------------------------

// Units coded by ≥ 2 coders are the ICR sample (protocol: overlap is
// everything). Values per unit: coder → axis → value.
const allUnitKeys = new Set()
for (const c of coders) for (const key of c.units.keys()) allUnitKeys.add(key)

const sharedUnits = [...allUnitKeys].filter((key) => {
  let n = 0
  for (const c of coders) if (c.units.has(key)) n++
  return n >= 2
})

const axisConfigs = [
  { axis: 'relevance', metric: 'nominal' },
  { axis: 'framing', metric: 'ordinal', order: ['0', '1', '2', '3'] },
  { axis: 'domain', metric: 'nominal' },
  { axis: 'prominence', metric: 'nominal' },
  { axis: 'type', metric: 'nominal' },
]

const icr = axisConfigs.map(({ axis, metric, order }) => {
  const units = sharedUnits.map((key) => {
    const m = new Map()
    for (const c of coders) {
      const v = c.units.get(key)?.[axis]
      if (v !== undefined) m.set(c.coder, v)
    }
    return m
  })
  const coded = units.filter((u) => u.size >= 2).length
  return { axis, metric, order, alpha: krippendorffAlpha(units, metric, order), codedUnits: coded }
})

// ---------------------------------------------------------------------------
// Tool comparison (per-mention export vs coder consensus)
// ---------------------------------------------------------------------------

let tool = null
if (exportCsvPath) {
  const csvRows = parseCsv(readFileSync(exportCsvPath, "utf8"))
  const header = csvRows[0].map(norm)
  const col = (name) => header.indexOf(name)
  // Coders key rows on the organisation ("Uni A"); the export's
  // university column is the same fact — prefer it over the report title.
  const docCol = col('university') >= 0 ? col('university') : col('document')
  const sdgCol = col('sdg')
  const passageCol = col('passage')
  const wordCol = col('word')
  const prominenceCol = col('prominence')

  const toolKeys = new Set()
  const toolStems = new Set()
  for (const row of csvRows.slice(1)) {
    const doc = docCol >= 0 ? row[docCol] : ''
    const sdg = sdgKey(row[sdgCol])
    const passage = row[passageCol] ?? ''
    if (!norm(passage) || !sdg) continue
    toolKeys.add(`${norm(doc)}|${sdg}|${norm(passage)}`)
    const w = norm(row[wordCol] ?? '')
    if (w) w.split('|').forEach((part) => toolStems.add(norm(part)))
  }

  // Coder "relevant" units (the precision/recall denominator per protocol).
  const relevantUnits = new Set()
  for (const key of allUnitKeys) {
    let relevant = false
    for (const c of coders) {
      const v = c.units.get(key)?.relevance
      if (v !== undefined && v.startsWith('rel')) relevant = true
    }
    if (relevant) relevantUnits.add(key)
  }

  let truePositive = 0
  for (const key of toolKeys) if (relevantUnits.has(key)) truePositive++
  let recalled = 0
  for (const key of relevantUnits) if (toolKeys.has(key)) recalled++

  tool = {
    toolRows: toolKeys.size,
    coderRelevantUnits: relevantUnits.size,
    precision: toolKeys.size === 0 ? NaN : truePositive / toolKeys.size,
    recall: relevantUnits.size === 0 ? NaN : recalled / relevantUnits.size,
  }
}

// ---------------------------------------------------------------------------
// Stem audit
// ---------------------------------------------------------------------------

const shippedStems = new Set()
for (const polarity of ['positive', 'counter']) {
  for (const entry of sustainabilityKeywords[polarity] ?? []) {
    shippedStems.add(norm(entry.text))
  }
}
for (const entry of v9SearchTerms.entries) {
  for (const stem of entry.stems) shippedStems.add(norm(stem))
  for (const stem of entry.counterStems) shippedStems.add(norm(stem))
}
const unshippedStems = [...stemUsage.keys()]
  .filter((stem) => !shippedStems.has(stem) && ![...shippedStems].some((s) => s.includes(stem) || stem.includes(s)))
  .sort()

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const lines = []
lines.push('# Calibration agreement report')
lines.push('')
lines.push(`Generated ${new Date().toISOString().slice(0, 10)} · coders: ${coders.map((c) => c.coder).join(', ')} · units total: ${allUnitKeys.size} · shared (≥2 coders): ${sharedUnits.length}`)
lines.push('')
lines.push('## Inter-coder reliability (Krippendorff\u2019s α)')
lines.push('')
lines.push('| Axis | Metric | α | Units coded ≥2 coders |')
lines.push('|---|---|---|---|')
for (const { axis, metric, alpha, codedUnits } of icr) {
  const rendered = Number.isNaN(alpha) ? 'n/a (insufficient overlap)' : alpha.toFixed(3)
  lines.push(`| ${axis} | ${metric} | ${rendered} | ${codedUnits} |`)
}
lines.push('')
lines.push('_Missing coders are never imputed; units with one coder are excluded from α by construction._')
lines.push('')

if (tool) {
  lines.push('## Tool vs coder consensus (per-mention export)')
  lines.push('')
  lines.push(`Tool deduplicated units: ${tool.toolRows} · coder-relevant units: ${tool.coderRelevantUnits}`)
  lines.push('')
  lines.push(`- **Precision** (tool mentions landing on coder-relevant units): ${Number.isNaN(tool.precision) ? 'n/a' : (tool.precision * 100).toFixed(1) + '%'}`)
  lines.push(`- **Recall** (coder-relevant units the tool finds): ${Number.isNaN(tool.recall) ? 'n/a' : (tool.recall * 100).toFixed(1) + '%'}`)
  lines.push('')
}

lines.push('## Stem audit — coder search terms not in the shipped keyword lists')
lines.push('')
const coderStems = [...stemUsage.keys()].sort()
lines.push(`Coders used ${coderStems.length} distinct stems; ${unshippedStems.length} are not covered by the shipped lists (exact or substring).`)
if (unshippedStems.length > 0) {
  lines.push('')
  for (const stem of unshippedStems) lines.push(`- \`${stem}\``)
}
lines.push('')

const report = lines.join('\n')
if (outPath) {
  writeFileSync(outPath, report + '\n')
  console.error(`[calibrate] report written to ${outPath}`)
} else {
  console.log(report)
}
