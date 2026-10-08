/**
 * Minimal xlsx reader for the calibration harness — zero dependencies.
 *
 * An .xlsx is a ZIP of XML parts. This reads exactly what the coding
 * sheets need: shared strings, sheet names → targets, and sheet cells
 * (shared-string, inline-string, and number cells). Dates, styles, and
 * formulas are out of scope — researcher sheets carry text and integers.
 *
 * Verified against Excel-generated files (the v9 coding-sheet template).
 */

import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

// ---------------------------------------------------------------------------
// Minimal ZIP reader (stored + deflate entries, via the central directory)
// ---------------------------------------------------------------------------

function readZipEntries(buf) {
  // Locate the End Of Central Directory record (scan backwards for the
  // signature; the comment field is why the offset isn't fixed).
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('Not a ZIP file (no EOCD record)')

  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)

  const entries = new Map()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Bad central directory')
    const method = buf.readUInt16LE(ptr + 10)
    const compressedSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8')

    // Walk the local header to find the data start (its name/extra lengths
    // can differ from the central directory's).
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = buf.slice(dataStart, dataStart + compressedSize)
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null
    if (data === null) throw new Error(`Unsupported compression method ${method} for ${name}`)

    entries.set(name, data)
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// ---------------------------------------------------------------------------
// Minimal XML helpers (regex-level — the shapes we read are machine-written)
// ---------------------------------------------------------------------------

function textOf(xml, tag) {
  const out = []
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  let m
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1])
  }
  return out
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** All <t> text inside one <si> shared-string item (may nest runs). */
function sharedStringOf(siXml) {
  return decodeXml(textOf(siXml, 't').join(''))
}

/** Column letters ("A", "AB") → 0-based index. */
function colIndex(ref) {
  const letters = ref.replace(/\d+/g, '')
  let idx = 0
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64)
  return idx - 1
}

// ---------------------------------------------------------------------------
// Workbook reading
// ---------------------------------------------------------------------------

/**
 * Read an .xlsx buffer into { sheetNames, sheet(name) → rows }.
 * rows: string[][] — every cell stringified (empty string when absent).
 */
export function readXlsx(buf) {
  const zip = readZipEntries(buf)

  const sharedStrings = []
  const sharedXml = zip.get('xl/sharedStrings.xml')
  if (sharedXml) {
    for (const si of textOf(sharedXml.toString('utf8'), 'si')) {
      sharedStrings.push(sharedStringOf(si))
    }
  }

  // Sheet name → r:id (tags are self-closing in Excel output), then
  // r:id → part path via the workbook rels.
  const workbookXml = zip.get('xl/workbook.xml').toString('utf8')
  const sheetNames = []
  const sheetRidByName = new Map()
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0]
    const name = tag.match(/name="([^"]+)"/)?.[1]
    const relId = tag.match(/r:id="([^"]+)"/)?.[1]
    if (name && relId) {
      sheetNames.push(decodeXml(name))
      sheetRidByName.set(decodeXml(name), relId)
    }
  }
  const relsXml = zip.get('xl/_rels/workbook.xml.rels').toString('utf8')
  const idToTarget = new Map()
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1]
    const target = m[0].match(/Target="([^"]+)"/)?.[1]
    if (id && target) idToTarget.set(id, target)
  }

  const cellValue = (cXml) => {
    const type = cXml.match(/t="([^"]+)"/)?.[1] ?? 'n'
    if (type === 'inlineStr') return decodeXml(textOf(cXml, 't').join(''))
    const v = cXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)
    if (!v) return ''
    if (type === 's') return sharedStrings[Number(v[1])] ?? ''
    if (type === 'str') return decodeXml(v[1])
    return v[1] // numbers stay as their literal text
  }

  function sheet(name) {
    const relId = sheetRidByName.get(name)
    if (relId === undefined) {
      throw new Error(`No sheet named "${name}" (known: ${sheetNames.join(', ')})`)
    }
    let target = idToTarget.get(relId)
    if (target === undefined) throw new Error(`No rel target for sheet "${name}"`)
    if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\//, '')

    const xml = zip.get(target)?.toString('utf8')
    if (xml === undefined) throw new Error(`Missing sheet part ${target}`)

    const rows = []
    // Cells need their FULL tag content (the type attribute lives on <c>),
    // so this scan keeps the wrapper — unlike textOf(), which returns only
    // the inner capture.
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = []
      for (const cMatch of rowMatch[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
        const cXml = cMatch[0]
        const ref = cXml.match(/r="([A-Z]+)\d+"/)
        const idx = ref ? colIndex(ref[1]) : cells.length
        cells[idx] = cellValue(cXml)
      }
      // Normalise holes to empty strings.
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = ''
      rows.push(cells)
    }
    // Drop leading fully-empty rows (template banners).
    while (rows.length > 0 && rows[0].every((c) => c === '')) rows.shift()
    return rows
  }

  return { sheetNames, sheet }
}

/** Convenience: read an .xlsx from a file path. */
export function readXlsxFile(path) {
  return readXlsx(readFileSync(path))
}
