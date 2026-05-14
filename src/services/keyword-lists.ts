import { selectAll, selectOne, runStatement, dbBool, toDbBool, newId, now } from './db'
import type {
  KeywordList,
  KeywordListType,
  Keyword,
  KeywordPolarity,
  KeywordTag,
} from '@/types/data'

interface KeywordListRow {
  id: string
  name: string
  description: string | null
  type: KeywordListType
  source: string | null
  parent_list_id: string | null
  created_at: string
  updated_at: string
}

interface KeywordRow {
  id: string
  list_id: string
  text: string
  polarity: KeywordPolarity
  enabled: number
  notes: string | null
  sort_order: number
}

interface KeywordTagRow {
  keyword_id: string
  lens_id: string
  value_id: string
}

function rowToList(row: KeywordListRow): KeywordList {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    parentListId: row.parent_list_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToKeyword(row: KeywordRow): Keyword {
  return {
    id: row.id,
    listId: row.list_id,
    text: row.text,
    polarity: row.polarity,
    enabled: dbBool(row.enabled),
    notes: row.notes,
    sortOrder: row.sort_order,
  }
}

// ---------------------------------------------------------------------------
// Keyword lists
// ---------------------------------------------------------------------------

export async function listKeywordLists(): Promise<KeywordList[]> {
  const rows = await selectAll<KeywordListRow>(
    "SELECT * FROM keyword_lists ORDER BY type, name"
  )
  return rows.map(rowToList)
}

export async function getKeywordList(id: string): Promise<KeywordList | null> {
  const row = await selectOne<KeywordListRow>(
    'SELECT * FROM keyword_lists WHERE id = ?',
    [id]
  )
  return row ? rowToList(row) : null
}

export interface CreateKeywordListInput {
  name: string
  description?: string
  type: KeywordListType
  source?: string
  parentListId?: string
}

export async function createKeywordList(input: CreateKeywordListInput): Promise<KeywordList> {
  const id = newId()
  const timestamp = now()
  await runStatement(
    `INSERT INTO keyword_lists
       (id, name, description, type, source, parent_list_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? null,
      input.type,
      input.source ?? null,
      input.parentListId ?? null,
      timestamp,
      timestamp,
    ]
  )
  const created = await getKeywordList(id)
  if (!created) throw new Error(`Failed to create keyword list ${input.name}`)
  return created
}

export async function deleteKeywordList(id: string): Promise<void> {
  await runStatement('DELETE FROM keyword_lists WHERE id = ?', [id])
}

export async function setKeywordListLenses(listId: string, lensIds: string[]): Promise<void> {
  await runStatement('DELETE FROM keyword_list_lenses WHERE list_id = ?', [listId])
  for (const lensId of lensIds) {
    await runStatement(
      'INSERT INTO keyword_list_lenses (list_id, lens_id) VALUES (?, ?)',
      [listId, lensId]
    )
  }
}

export async function getKeywordListLenses(listId: string): Promise<string[]> {
  const rows = await selectAll<{ lens_id: string }>(
    'SELECT lens_id FROM keyword_list_lenses WHERE list_id = ?',
    [listId]
  )
  return rows.map((r) => r.lens_id)
}

// ---------------------------------------------------------------------------
// Keywords within a list
// ---------------------------------------------------------------------------

export async function listKeywords(listId: string): Promise<Keyword[]> {
  const rows = await selectAll<KeywordRow>(
    'SELECT * FROM keywords WHERE list_id = ? ORDER BY polarity, sort_order, text',
    [listId]
  )
  return rows.map(rowToKeyword)
}

export interface CreateKeywordInput {
  listId: string
  text: string
  polarity: KeywordPolarity
  enabled?: boolean
  notes?: string
  sortOrder?: number
}

export async function createKeyword(input: CreateKeywordInput): Promise<Keyword> {
  const id = newId()
  await runStatement(
    `INSERT INTO keywords (id, list_id, text, polarity, enabled, notes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.listId,
      input.text,
      input.polarity,
      toDbBool(input.enabled ?? true),
      input.notes ?? null,
      input.sortOrder ?? 0,
    ]
  )
  const row = await selectOne<KeywordRow>('SELECT * FROM keywords WHERE id = ?', [id])
  if (!row) throw new Error(`Failed to create keyword ${input.text}`)
  return rowToKeyword(row)
}

export async function setKeywordEnabled(id: string, enabled: boolean): Promise<void> {
  await runStatement('UPDATE keywords SET enabled = ? WHERE id = ?', [toDbBool(enabled), id])
}

export interface UpdateKeywordInput {
  text?: string
  polarity?: KeywordPolarity
  notes?: string | null
  sortOrder?: number
}

/**
 * Patch one or more fields on a keyword. Used by the Keywords page
 * for inline edits (text, polarity, notes). Skips fields not in the
 * patch — leaves enabled / list_id alone (those have dedicated helpers
 * because the CRUD shape differs).
 */
export async function updateKeyword(id: string, patch: UpdateKeywordInput): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []
  if (patch.text !== undefined) {
    fields.push('text = ?')
    params.push(patch.text)
  }
  if (patch.polarity !== undefined) {
    fields.push('polarity = ?')
    params.push(patch.polarity)
  }
  if (patch.notes !== undefined) {
    fields.push('notes = ?')
    params.push(patch.notes)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    params.push(patch.sortOrder)
  }
  if (fields.length === 0) return
  params.push(id)
  await runStatement(`UPDATE keywords SET ${fields.join(', ')} WHERE id = ?`, params)
}

export async function deleteKeyword(id: string): Promise<void> {
  await runStatement('DELETE FROM keywords WHERE id = ?', [id])
}

// ---------------------------------------------------------------------------
// Keyword tags (which lens-value pairs each keyword carries)
// ---------------------------------------------------------------------------

export async function listKeywordTags(keywordId: string): Promise<KeywordTag[]> {
  const rows = await selectAll<KeywordTagRow>(
    'SELECT * FROM keyword_tags WHERE keyword_id = ?',
    [keywordId]
  )
  return rows.map((r) => ({
    keywordId: r.keyword_id,
    lensId: r.lens_id,
    valueId: r.value_id,
  }))
}

export async function setKeywordTag(
  keywordId: string,
  lensId: string,
  valueId: string
): Promise<void> {
  await runStatement(
    `INSERT OR IGNORE INTO keyword_tags (keyword_id, lens_id, value_id) VALUES (?, ?, ?)`,
    [keywordId, lensId, valueId]
  )
}

export async function clearKeywordTagsForLens(keywordId: string, lensId: string): Promise<void> {
  await runStatement(
    'DELETE FROM keyword_tags WHERE keyword_id = ? AND lens_id = ?',
    [keywordId, lensId]
  )
}

// ---------------------------------------------------------------------------
// Synonyms (per-keyword child list)
// ---------------------------------------------------------------------------

import type { Synonym, SynonymSource } from '@/types/data'

interface SynonymRow {
  id: string
  keyword_id: string
  text: string
  enabled: number
  source: SynonymSource
  added_at: string
}

function rowToSynonym(row: SynonymRow): Synonym {
  return {
    id: row.id,
    keywordId: row.keyword_id,
    text: row.text,
    enabled: dbBool(row.enabled),
    source: row.source,
    addedAt: row.added_at,
  }
}

export async function listSynonyms(keywordId: string): Promise<Synonym[]> {
  const rows = await selectAll<SynonymRow>(
    'SELECT * FROM synonyms WHERE keyword_id = ? ORDER BY added_at',
    [keywordId]
  )
  return rows.map(rowToSynonym)
}

export interface CreateSynonymInput {
  keywordId: string
  text: string
  source?: SynonymSource
}

export async function createSynonym(input: CreateSynonymInput): Promise<Synonym> {
  const id = newId()
  await runStatement(
    `INSERT INTO synonyms (id, keyword_id, text, enabled, source, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.keywordId,
      input.text,
      toDbBool(true),
      input.source ?? 'user',
      now(),
    ]
  )
  const row = await selectOne<SynonymRow>('SELECT * FROM synonyms WHERE id = ?', [id])
  if (!row) throw new Error(`Failed to create synonym ${input.text}`)
  return rowToSynonym(row)
}

export async function deleteSynonym(id: string): Promise<void> {
  await runStatement('DELETE FROM synonyms WHERE id = ?', [id])
}

export async function setSynonymEnabled(id: string, enabled: boolean): Promise<void> {
  await runStatement('UPDATE synonyms SET enabled = ? WHERE id = ?', [toDbBool(enabled), id])
}

/**
 * Bulk presence check — given (keywordId, text) pairs, return the set
 * of pairs that already exist in the synonyms table. Used by Discover
 * Synonyms to filter out already-accepted candidates without 1 SQL
 * call per (keyword, candidate).
 */
export async function listExistingSynonymsForKeywords(
  keywordIds: string[]
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (keywordIds.length === 0) return out
  const placeholders = keywordIds.map(() => '?').join(',')
  const rows = await selectAll<{ keyword_id: string; text: string }>(
    `SELECT keyword_id, text FROM synonyms WHERE keyword_id IN (${placeholders})`,
    keywordIds
  )
  for (const r of rows) {
    const set = out.get(r.keyword_id) ?? new Set<string>()
    set.add(r.text.toLowerCase())
    out.set(r.keyword_id, set)
  }
  return out
}
