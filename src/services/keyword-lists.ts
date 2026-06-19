import {
  selectAll,
  selectOne,
  runStatement,
  runBatch,
  updateRow,
  selectInList,
  dbBool,
  toDbBool,
  newId,
  now,
} from './db'
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
  const rows = await selectAll<KeywordListRow>('keywordLists.list')
  return rows.map(rowToList)
}

export async function getKeywordList(id: string): Promise<KeywordList | null> {
  const row = await selectOne<KeywordListRow>('keywordLists.getById', [id])
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
  await runStatement('keywordLists.create', [
    id,
    input.name,
    input.description ?? null,
    input.type,
    input.source ?? null,
    input.parentListId ?? null,
    timestamp,
    timestamp,
  ])
  const created = await getKeywordList(id)
  if (!created) throw new Error(`Failed to create keyword list ${input.name}`)
  return created
}

export async function deleteKeywordList(id: string): Promise<void> {
  await runStatement('keywordLists.deleteById', [id])
}

export async function setKeywordListAxes(listId: string, axisIds: string[]): Promise<void> {
  // Clear-then-insert atomically so a crash can't leave the list with no axes.
  await runBatch([
    { key: 'keywordLists.clearLenses', params: [listId] },
    ...axisIds.map((axisId) => ({ key: 'keywordLists.addLens', params: [listId, axisId] })),
  ])
}

export async function getKeywordListAxes(listId: string): Promise<string[]> {
  const rows = await selectAll<{ lens_id: string }>('keywordLists.listLensIds', [listId])
  return rows.map((r) => r.lens_id)
}

// ---------------------------------------------------------------------------
// Keywords within a list
// ---------------------------------------------------------------------------

export async function listKeywords(listId: string): Promise<Keyword[]> {
  const rows = await selectAll<KeywordRow>('keywords.listByList', [listId])
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
  await runStatement('keywords.create', [
    id,
    input.listId,
    input.text,
    input.polarity,
    toDbBool(input.enabled ?? true),
    input.notes ?? null,
    input.sortOrder ?? 0,
  ])
  const row = await selectOne<KeywordRow>('keywords.getById', [id])
  if (!row) throw new Error(`Failed to create keyword ${input.text}`)
  return rowToKeyword(row)
}

export async function setKeywordEnabled(id: string, enabled: boolean): Promise<void> {
  await runStatement('keywords.setEnabled', [toDbBool(enabled), id])
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
  const columns: string[] = []
  const params: unknown[] = []
  if (patch.text !== undefined) {
    columns.push('text')
    params.push(patch.text)
  }
  if (patch.polarity !== undefined) {
    columns.push('polarity')
    params.push(patch.polarity)
  }
  if (patch.notes !== undefined) {
    columns.push('notes')
    params.push(patch.notes)
  }
  if (patch.sortOrder !== undefined) {
    columns.push('sort_order')
    params.push(patch.sortOrder)
  }
  if (columns.length === 0) return
  params.push(id)
  await updateRow('keywords', columns, 'id', params)
}

export async function deleteKeyword(id: string): Promise<void> {
  await runStatement('keywords.deleteById', [id])
}

// ---------------------------------------------------------------------------
// Keyword tags (which lens-value pairs each keyword carries)
// ---------------------------------------------------------------------------

export async function listKeywordTags(keywordId: string): Promise<KeywordTag[]> {
  const rows = await selectAll<KeywordTagRow>('keywords.listTags', [keywordId])
  return rows.map((r) => ({
    keywordId: r.keyword_id,
    axisId: r.lens_id,
    valueId: r.value_id,
  }))
}

export async function setKeywordTag(
  keywordId: string,
  lensId: string,
  valueId: string
): Promise<void> {
  await runStatement('keywords.addTag', [keywordId, lensId, valueId])
}

export async function clearKeywordTagsForLens(keywordId: string, lensId: string): Promise<void> {
  await runStatement('keywords.clearTagsForLens', [keywordId, lensId])
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
  const rows = await selectAll<SynonymRow>('synonyms.listByKeyword', [keywordId])
  return rows.map(rowToSynonym)
}

export interface CreateSynonymInput {
  keywordId: string
  text: string
  source?: SynonymSource
}

export async function createSynonym(input: CreateSynonymInput): Promise<Synonym> {
  const id = newId()
  await runStatement('synonyms.create', [
    id,
    input.keywordId,
    input.text,
    toDbBool(true),
    input.source ?? 'user',
    now(),
  ])
  const row = await selectOne<SynonymRow>('synonyms.getById', [id])
  if (!row) throw new Error(`Failed to create synonym ${input.text}`)
  return rowToSynonym(row)
}

export async function deleteSynonym(id: string): Promise<void> {
  await runStatement('synonyms.deleteById', [id])
}

export async function setSynonymEnabled(id: string, enabled: boolean): Promise<void> {
  await runStatement('synonyms.setEnabled', [toDbBool(enabled), id])
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
  const rows = await selectInList<{ keyword_id: string; text: string }>(
    'synonyms.byKeywordIds',
    keywordIds
  )
  for (const r of rows) {
    const set = out.get(r.keyword_id) ?? new Set<string>()
    set.add(r.text.toLowerCase())
    out.set(r.keyword_id, set)
  }
  return out
}

/**
 * Map of keyword_id -> [enabled synonym texts] for a set of keywords, in
 * one query. Used by the analysis workflows to fold accepted synonyms into
 * their parent keyword's match count (US-A-04). Only enabled synonyms are
 * returned; disabled ones are ignored in matching.
 */
export async function listEnabledSynonymsForKeywords(
  keywordIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (keywordIds.length === 0) return out
  const rows = await selectInList<{ keyword_id: string; text: string }>(
    'synonyms.enabledByKeywordIds',
    keywordIds
  )
  for (const r of rows) {
    const list = out.get(r.keyword_id) ?? []
    list.push(r.text)
    out.set(r.keyword_id, list)
  }
  return out
}

// ---------------------------------------------------------------------------
// Keyword exclusion phrases (per-keyword child list)
// ---------------------------------------------------------------------------

import type { KeywordExclusion, SuppressedSpan } from '@/types/data'

interface ExclusionRow {
  id: string
  keyword_id: string
  phrase: string
  added_at: string
}

function rowToExclusion(row: ExclusionRow): KeywordExclusion {
  return { id: row.id, keywordId: row.keyword_id, phrase: row.phrase, addedAt: row.added_at }
}

export async function listExclusions(keywordId: string): Promise<KeywordExclusion[]> {
  const rows = await selectAll<ExclusionRow>('exclusions.listByKeyword', [keywordId])
  return rows.map(rowToExclusion)
}

export async function createExclusion(input: { keywordId: string; phrase: string }): Promise<KeywordExclusion> {
  const id = newId()
  await runStatement('exclusions.create', [id, input.keywordId, input.phrase, now()])
  const row = await selectOne<ExclusionRow>('exclusions.getById', [id])
  if (!row) throw new Error(`Failed to create exclusion "${input.phrase}"`)
  return rowToExclusion(row)
}

export async function deleteExclusion(id: string): Promise<void> {
  await runStatement('exclusions.deleteById', [id])
}

/**
 * Map of keyword_id -> [exclusion phrases] for a set of keywords, in one
 * query. Used by the analysis pipeline to veto spans where an exclusion
 * phrase appears in the same sentence as the keyword match.
 */
export async function listExclusionPhrasesForKeywords(
  keywordIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (keywordIds.length === 0) return out
  const rows = await selectInList<{ keyword_id: string; phrase: string }>(
    'exclusions.phrasesByKeywordIds',
    keywordIds
  )
  for (const r of rows) {
    const list = out.get(r.keyword_id) ?? []
    list.push(r.phrase)
    out.set(r.keyword_id, list)
  }
  return out
}

// ---------------------------------------------------------------------------
// Per-instance match suppressions
// ---------------------------------------------------------------------------

interface SuppressedSpanRow {
  id: string
  keyword_id: string
  document_id: string
  start_offset: number
  end_offset: number
  reason: string | null
  suppressed_at: string
}

function rowToSuppressedSpan(row: SuppressedSpanRow): SuppressedSpan {
  return {
    id: row.id,
    keywordId: row.keyword_id,
    documentId: row.document_id,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    reason: row.reason,
    suppressedAt: row.suppressed_at,
  }
}

export async function suppressSpan(input: {
  keywordId: string
  documentId: string
  startOffset: number
  endOffset: number
  reason?: string
}): Promise<SuppressedSpan> {
  const id = newId()
  await runStatement('suppressedSpans.create', [
    id, input.keywordId, input.documentId,
    input.startOffset, input.endOffset,
    input.reason ?? null, now(),
  ])
  const row = await selectOne<SuppressedSpanRow>('suppressedSpans.getById', [id])
  if (!row) throw new Error('Failed to create suppressed span')
  return rowToSuppressedSpan(row)
}

export async function restoreSpan(id: string): Promise<void> {
  await runStatement('suppressedSpans.deleteById', [id])
}

export async function listSuppressedSpansForKeyword(
  documentId: string,
  keywordId: string
): Promise<SuppressedSpan[]> {
  const rows = await selectAll<SuppressedSpanRow>('suppressedSpans.forKeywordInDoc', [keywordId, documentId])
  return rows.map(rowToSuppressedSpan)
}

/**
 * Map of keywordId -> documentId -> Set<startOffset> for the analysis
 * pipeline. Lets spansFor() check suppression in O(1) per span.
 */
// ---------------------------------------------------------------------------
// Antonym links (positive keyword ↔ counter keyword)
// ---------------------------------------------------------------------------

/**
 * Return counter keywords that are marked as antonyms of the given positive keyword.
 */
export async function listAntonymKeywords(positiveKeywordId: string): Promise<Keyword[]> {
  const rows = await selectAll<KeywordRow>('antonyms.forPositiveKeyword', [positiveKeywordId])
  return rows.map(rowToKeyword)
}

/**
 * Link an existing counter keyword as an antonym of a positive keyword.
 * Safe to call if the link already exists (INSERT OR IGNORE).
 */
export async function linkAntonym(positiveKeywordId: string, counterKeywordId: string): Promise<void> {
  await runStatement('antonyms.link', [positiveKeywordId, counterKeywordId])
}

/**
 * Remove the antonym link between a positive keyword and a counter keyword.
 * Does NOT delete the counter keyword itself.
 */
export async function unlinkAntonym(positiveKeywordId: string, counterKeywordId: string): Promise<void> {
  await runStatement('antonyms.unlink', [positiveKeywordId, counterKeywordId])
}

/**
 * Create a new counter keyword in the same list as the given positive keyword,
 * then immediately link it as an antonym. Returns the new counter keyword.
 */
export async function createAndLinkAntonym(
  positiveKeywordId: string,
  listId: string,
  text: string
): Promise<Keyword> {
  const counterKw = await createKeyword({ listId, text, polarity: 'counter' })
  await linkAntonym(positiveKeywordId, counterKw.id)
  return counterKw
}

export async function loadSuppressedOffsetsForKeywords(
  keywordIds: string[]
): Promise<Map<string, Map<string, Set<number>>>> {
  const out = new Map<string, Map<string, Set<number>>>()
  if (keywordIds.length === 0) return out
  const rows = await selectInList<{
    keyword_id: string; document_id: string; start_offset: number; end_offset: number
  }>('suppressedSpans.byKeywordIds', keywordIds)
  for (const r of rows) {
    let byDoc = out.get(r.keyword_id)
    if (!byDoc) { byDoc = new Map(); out.set(r.keyword_id, byDoc) }
    let offsets = byDoc.get(r.document_id)
    if (!offsets) { offsets = new Set(); byDoc.set(r.document_id, offsets) }
    offsets.add(r.start_offset)
  }
  return out
}
