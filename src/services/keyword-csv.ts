/**
 * Keyword-list CSV export / import.
 *
 * Export writes one row per keyword with the columns researchers care about:
 *   text, polarity, enabled, notes, synonyms, + one column per lens (tags).
 * Import reads the same shape and CREATES A NEW LIST (never mutates an
 * existing one), so a researcher can export the SDG default, edit it in a
 * spreadsheet, "Save As CSV", and re-import it as their own list.
 *
 * Forgiving by design: only `text` is required on import; polarity defaults to
 * positive, enabled to true; unknown columns and unmatched tag values are
 * skipped and reported in the summary rather than failing the whole import.
 */

import { parseCsv, stringifyCsv } from './csv'
import {
  getKeywordList,
  listKeywordLists,
  createKeywordList,
  listKeywords,
  createKeyword,
  listKeywordTags,
  setKeywordTag,
  getKeywordListLenses,
  setKeywordListLenses,
  listSynonyms,
  createSynonym,
} from './keyword-lists'
import { listLenses, listLensValues } from './lenses'
import type { KeywordPolarity } from '@/types/data'

const BASE_HEADERS = ['text', 'polarity', 'enabled', 'notes', 'synonyms'] as const
const SYNONYM_SEP = ';'

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Serialise a keyword list to CSV text. */
export async function keywordListToCsv(listId: string): Promise<string> {
  const list = await getKeywordList(listId)
  if (!list) throw new Error('Keyword list not found')

  const keywords = await listKeywords(listId)

  // Lenses to emit as tag columns: the list's declared lenses, plus any lens
  // actually referenced by a keyword tag (so nothing is silently dropped).
  const tagsByKeyword = new Map<string, { lensId: string; valueId: string }[]>()
  const lensIdSet = new Set<string>(await getKeywordListLenses(listId))
  for (const kw of keywords) {
    const tags = await listKeywordTags(kw.id)
    tagsByKeyword.set(kw.id, tags)
    for (const t of tags) lensIdSet.add(t.lensId)
  }

  // Build lens metadata: lensId -> { name, valueId -> code }.
  const allLenses = await listLenses()
  const lensCols: { lensId: string; name: string; valueCode: Map<string, string> }[] = []
  for (const lensId of lensIdSet) {
    const lens = allLenses.find((l) => l.id === lensId)
    if (!lens) continue
    const values = await listLensValues(lensId)
    const valueCode = new Map(values.map((v) => [v.id, v.value]))
    lensCols.push({ lensId, name: lens.name, valueCode })
  }

  // Synonyms per keyword.
  const synonymsByKeyword = new Map<string, string[]>()
  for (const kw of keywords) {
    const syns = await listSynonyms(kw.id)
    synonymsByKeyword.set(kw.id, syns.map((s) => s.text))
  }

  const header = [...BASE_HEADERS, ...lensCols.map((l) => l.name)]
  const rows: (string | number)[][] = [header]
  for (const kw of keywords) {
    const tags = tagsByKeyword.get(kw.id) ?? []
    const lensCells = lensCols.map((col) =>
      tags
        .filter((t) => t.lensId === col.lensId)
        .map((t) => col.valueCode.get(t.valueId))
        .filter((c): c is string => Boolean(c))
        .join(SYNONYM_SEP)
    )
    rows.push([
      kw.text,
      kw.polarity,
      kw.enabled ? 'true' : 'false',
      kw.notes ?? '',
      (synonymsByKeyword.get(kw.id) ?? []).join(SYNONYM_SEP),
      ...lensCells,
    ])
  }
  return stringifyCsv(rows)
}

/** Suggested filename for an exported list (no path). */
export function suggestKeywordCsvName(listName: string): string {
  const safe = listName.replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-') || 'keywords'
  return `${safe}.csv`
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface KeywordImportSummary {
  listId: string
  listName: string
  keywordsCreated: number
  synonymsCreated: number
  tagsApplied: number
  /** Lens columns in the CSV that didn't match any existing lens (ignored). */
  ignoredColumns: string[]
  /** Distinct tag values that matched a lens column but no lens value. */
  unmatchedTagValues: string[]
}

/**
 * Undo the spreadsheet formula-injection guard that {@link stringifyCsv} adds
 * (a leading `'` before a cell starting with = + - @ / tab / CR). Reverses it
 * precisely so a keyword like `+ve` round-trips, without stripping a
 * deliberately-typed leading apostrophe.
 */
function unguard(cell: string): string {
  return cell.length > 1 && cell[0] === "'" && /[=+\-@\t\r]/.test(cell[1]) ? cell.slice(1) : cell
}

function parsePolarity(raw: string): KeywordPolarity {
  return raw.trim().toLowerCase().startsWith('counter') ? 'counter' : 'positive'
}

function parseEnabled(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return !(v === 'false' || v === '0' || v === 'no' || v === 'disabled')
}

/** Build "X (imported)" / "X (imported 2)" so import never clobbers a name. */
function uniqueName(desired: string, existing: string[]): string {
  if (!existing.includes(desired)) return desired
  let n = 1
  let candidate = `${desired} (imported)`
  while (existing.includes(candidate)) candidate = `${desired} (imported ${++n})`
  return candidate
}

/**
 * Create a NEW keyword list from CSV text. Returns a summary of what landed
 * and what was skipped. Throws only if the CSV has no `text` column or no rows.
 */
export async function csvToNewKeywordList(
  csvText: string,
  desiredName: string
): Promise<KeywordImportSummary> {
  const rows = parseCsv(csvText)
  if (rows.length < 2) throw new Error('CSV has no data rows.')

  const header = rows[0].map((h) => unguard(h).trim())
  const lower = header.map((h) => h.toLowerCase())
  const col = (name: string) => lower.indexOf(name)

  const textIdx = col('text')
  if (textIdx === -1) throw new Error('CSV must have a "text" column.')
  const polIdx = col('polarity')
  const enIdx = col('enabled')
  const notesIdx = col('notes')
  const synIdx = col('synonyms')

  // Match any non-base column header to an existing lens (case-insensitive).
  const allLenses = await listLenses()
  const baseSet = new Set<string>(BASE_HEADERS)
  const ignoredColumns: string[] = []
  const lensColumns: {
    index: number
    lensId: string
    // lowercased code OR display name -> valueId
    valueMatch: Map<string, string>
  }[] = []
  for (let i = 0; i < header.length; i++) {
    if (i === textIdx || baseSet.has(lower[i])) continue
    const lens = allLenses.find((l) => l.name.toLowerCase() === lower[i])
    if (!lens) {
      if (header[i]) ignoredColumns.push(header[i])
      continue
    }
    const values = await listLensValues(lens.id)
    const valueMatch = new Map<string, string>()
    for (const v of values) {
      valueMatch.set(v.value.toLowerCase(), v.id)
      if (v.displayName) valueMatch.set(v.displayName.toLowerCase(), v.id)
    }
    lensColumns.push({ index: i, lensId: lens.id, valueMatch })
  }

  // Create the list (unique name) and wire up the matched lenses.
  const existingNames = (await listKeywordLists()).map((l) => l.name)
  const name = uniqueName(desiredName.trim() || 'Imported keywords', existingNames)
  const list = await createKeywordList({ name, type: 'custom', source: 'csv-import' })
  if (lensColumns.length > 0) {
    await setKeywordListLenses(list.id, lensColumns.map((c) => c.lensId))
  }

  let keywordsCreated = 0
  let synonymsCreated = 0
  let tagsApplied = 0
  const unmatched = new Set<string>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const text = unguard(row[textIdx] ?? '').trim()
    if (!text) continue

    const keyword = await createKeyword({
      listId: list.id,
      text,
      polarity: polIdx >= 0 ? parsePolarity(row[polIdx] ?? '') : 'positive',
      enabled: enIdx >= 0 ? parseEnabled(row[enIdx] ?? '') : true,
      notes: notesIdx >= 0 ? unguard(row[notesIdx] ?? '').trim() || undefined : undefined,
      sortOrder: r,
    })
    keywordsCreated++

    if (synIdx >= 0) {
      for (const syn of splitMulti(row[synIdx])) {
        await createSynonym({ keywordId: keyword.id, text: syn, source: 'user' })
        synonymsCreated++
      }
    }

    for (const lc of lensColumns) {
      for (const raw of splitMulti(row[lc.index])) {
        const valueId = lc.valueMatch.get(raw.toLowerCase())
        if (valueId) {
          await setKeywordTag(keyword.id, lc.lensId, valueId)
          tagsApplied++
        } else {
          unmatched.add(raw)
        }
      }
    }
  }

  return {
    listId: list.id,
    listName: name,
    keywordsCreated,
    synonymsCreated,
    tagsApplied,
    ignoredColumns,
    unmatchedTagValues: [...unmatched],
  }
}

function splitMulti(cell: string | undefined): string[] {
  return (cell ?? '')
    .split(SYNONYM_SEP)
    .map((s) => unguard(s).trim())
    .filter(Boolean)
}
