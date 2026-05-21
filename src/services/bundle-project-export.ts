/**
 * Project bundle export — `.lens` ZIP for researcher-to-researcher sharing.
 *
 * Single-user / local-first by design (privacy + data governance —
 * no auth, no central DB). A researcher emails a `.lens` to a
 * colleague; the colleague imports it (see bundle-project-import.ts)
 * and immediately sees the same analysis.
 *
 * Distinct from bundle-export.ts (paper-ready bundle): that one
 * snapshots the current Track view as CSV + PNG for academic
 * publication. This one snapshots the entire project state for
 * collaboration.
 *
 * Bundle layout:
 *   manifest.json         — schema version + project name + counts + flags
 *   project.json          — the project row + active scoring rule id
 *   keyword-lists.json    — lists + keywords + synonyms + tags + lens links
 *   lenses.json           — lenses + values
 *   scoring-rules.json    — the scoring rule(s) referenced by this project
 *   documents.json        — doc metadata + extracted_text + per-page text
 *                           + sections + section_lens_tags
 *   files/{hash}.{ext}    — original source files (optional; opt-out)
 *
 * The manifest's `bundleSchemaVersion` is independent of the SQLite
 * SCHEMA_VERSION because the bundle's data model can outlive on-disk
 * schema bumps (backwards-compatible adds don't break the bundle
 * format).
 */

import JSZip from 'jszip'
import { selectAll } from './db'
import {
  listKeywords,
  listSynonyms,
  listKeywordTags,
  getKeywordListLenses,
} from './keyword-lists'
import { listLensValues } from './lenses'
import { getScoringRule } from './scoring-rules'
import { listSections, getSectionTagsForDocument } from './sections'
import { type DocumentRow, rowToDocument } from './_shared/document-row'
import type {
  Project,
  KeywordList,
  Keyword,
  Synonym,
  Lens,
  LensValue,
  ScoringRule,
  Document,
  DocumentStatus,
} from '@/types/data'

export const BUNDLE_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// On-disk bundle shapes (versioned — change requires bumping
// BUNDLE_SCHEMA_VERSION + a compatibility note in the importer)
// ---------------------------------------------------------------------------

export interface BundleManifest {
  bundleSchemaVersion: number
  exportedAt: string
  exporterAppVersion: string
  projectName: string
  counts: {
    documents: number
    keywordLists: number
    keywords: number
    synonyms: number
    lenses: number
    scoringRules: number
  }
  /** True when source files are bundled under files/. False when
   *  opt-out or no files were available. */
  filesIncluded: boolean
  /** Total bytes of files included; 0 when filesIncluded === false. */
  filesBytes: number
}

export interface BundleProject {
  name: string
  description: string | null
  researchFocus: string | null
  /** Reference to a scoring rule by NAME (not ID) — IDs are remapped
   *  on import. */
  scoringRuleName: string | null
}

export interface BundleKeywordList {
  name: string
  description: string | null
  type: KeywordList['type']
  source: string | null
  parentListName: string | null  // refs a parent by name (rare; kept for taxonomy support)
  declaredLenses: string[]       // lens names this list expects
  keywords: BundleKeyword[]
}

export interface BundleKeyword {
  text: string
  polarity: Keyword['polarity']
  enabled: boolean
  notes: string | null
  sortOrder: number
  /** Tags as { lensName, valueName } so the importer can re-resolve
   *  to remapped IDs. */
  tags: Array<{ lensName: string; valueName: string }>
  synonyms: BundleSynonym[]
}

export interface BundleSynonym {
  text: string
  enabled: boolean
  source: Synonym['source']
  addedAt: string
}

export interface BundleLens {
  name: string
  description: string | null
  type: Lens['type']
  isHierarchical: boolean
  isBuiltin: boolean
  values: BundleLensValue[]
}

export interface BundleLensValue {
  value: string
  displayName: string | null
  description: string | null
  parentValueName: string | null  // hierarchy refs by name
  sortOrder: number
}

export interface BundleDocument {
  fileHash: string
  filename: string
  fileSize: number | null
  title: string | null
  year: number | null
  company: string | null
  sector: string | null
  pageCount: number | null
  wordCount: number | null
  extractedText: string | null
  pdfMetadata: Record<string, unknown> | null
  status: DocumentStatus
  importedAt: string
  extractedAt: string | null
  /** Per-page text from document_pages, page_number → text. Empty
   *  array when the doc has no per-page extraction. */
  pages: Array<{ pageNumber: number; text: string }>
  /** Detected sections for the doc (offsets + text). Empty when
   *  classification has never been run. */
  sections: Array<{
    sectionIndex: number
    startOffset: number
    endOffset: number
    text: string
    classifiedAt: string | null
  }>
  /** Per-section lens tags as (lensName, valueName, confidence) so
   *  they can be re-resolved against the imported lens IDs. */
  sectionTags: Array<{
    sectionIndex: number
    lensName: string
    valueName: string
    confidence: number | null
  }>
  /** Original-file inclusion: filename inside files/ or null if not
   *  included in this bundle. */
  bundledFile: string | null
}

export interface ExportOptions {
  /** Include source PDF/DOCX/etc files in the ZIP. Default true.
   *  Setting false halves bundle size but the recipient can't
   *  Preview / Open the source — they get text-only analysis. */
  includeFiles?: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function exportProjectBundle(
  project: Project,
  opts: ExportOptions = {}
): Promise<{ filePath: string } | { cancelled: true }> {
  const includeFiles = opts.includeFiles ?? true

  const electron = window.electron
  if (!electron) throw new Error('Electron API not available')

  const filename = suggestBundleFilename(project)
  const dialog = await electron.saveFileDialog({
    title: 'Export project bundle',
    defaultPath: filename,
    buttonLabel: 'Save bundle',
    filters: [{ name: 'Document Lens bundle', extensions: ['lens'] }],
  })
  if (dialog.canceled || !dialog.filePath) return { cancelled: true }

  const zip = new JSZip()

  // --- Lenses + values ------------------------------------------------------
  const allLenses = await getProjectLenses(project.id)
  const lensValuesByLensId = new Map<string, LensValue[]>()
  for (const lens of allLenses) {
    lensValuesByLensId.set(lens.id, await listLensValues(lens.id))
  }
  const bundleLenses: BundleLens[] = allLenses.map((l) => ({
    name: l.name,
    description: l.description,
    type: l.type,
    isHierarchical: l.isHierarchical,
    isBuiltin: l.isBuiltin,
    values: (lensValuesByLensId.get(l.id) ?? []).map((v) => ({
      value: v.value,
      displayName: v.displayName,
      description: v.description,
      parentValueName: v.parentValueId
        ? (lensValuesByLensId.get(l.id) ?? []).find((p) => p.id === v.parentValueId)?.value ?? null
        : null,
      sortOrder: v.sortOrder,
    })),
  }))

  // Build lookup maps so the keyword-list and document serialisers
  // can convert (lensId, valueId) tags into (lensName, valueName).
  const lensIdToName = new Map<string, string>()
  for (const l of allLenses) lensIdToName.set(l.id, l.name)
  const valueIdToName = new Map<string, string>()
  for (const [, values] of lensValuesByLensId) {
    for (const v of values) valueIdToName.set(v.id, v.value)
  }

  // --- Keyword lists --------------------------------------------------------
  const keywordLists = await getProjectKeywordLists(project.id)
  const bundleKeywordLists: BundleKeywordList[] = []
  let totalKeywords = 0
  let totalSynonyms = 0
  for (const list of keywordLists) {
    const keywords = await listKeywords(list.id)
    const declaredLensIds = await getKeywordListLenses(list.id)
    const declaredLensNames = declaredLensIds
      .map((id) => lensIdToName.get(id))
      .filter((n): n is string => Boolean(n))

    const bundleKeywords: BundleKeyword[] = []
    for (const kw of keywords) {
      const [tags, synonyms] = await Promise.all([
        listKeywordTags(kw.id),
        listSynonyms(kw.id),
      ])
      const namedTags = tags
        .map((t) => ({
          lensName: lensIdToName.get(t.lensId) ?? null,
          valueName: valueIdToName.get(t.valueId) ?? null,
        }))
        .filter((t): t is { lensName: string; valueName: string } =>
          Boolean(t.lensName && t.valueName)
        )
      bundleKeywords.push({
        text: kw.text,
        polarity: kw.polarity,
        enabled: kw.enabled,
        notes: kw.notes,
        sortOrder: kw.sortOrder,
        tags: namedTags,
        synonyms: synonyms.map((s) => ({
          text: s.text,
          enabled: s.enabled,
          source: s.source,
          addedAt: s.addedAt,
        })),
      })
      totalKeywords++
      totalSynonyms += synonyms.length
    }

    const parentListName = list.parentListId
      ? keywordLists.find((l) => l.id === list.parentListId)?.name ?? null
      : null

    bundleKeywordLists.push({
      name: list.name,
      description: list.description,
      type: list.type,
      source: list.source,
      parentListName,
      declaredLenses: declaredLensNames,
      keywords: bundleKeywords,
    })
  }

  // --- Scoring rules --------------------------------------------------------
  const scoringRules: BundleScoringRule[] = []
  let scoringRuleName: string | null = null
  if (project.scoringRuleId) {
    const rule = await getScoringRule(project.scoringRuleId)
    if (rule) {
      scoringRuleName = rule.name
      scoringRules.push(serializeScoringRule(rule, lensIdToName, valueIdToName))
    }
  }

  // --- Documents + per-page + sections + section tags + (optional) files ---
  const documents = await getProjectDocuments(project.id)
  const bundleDocuments: BundleDocument[] = []
  let filesBytes = 0
  let actuallyIncludedFiles = false
  for (const doc of documents) {
    const pages = await selectAll<{ page_number: number; text: string }>(
      'documentPages.byDocument',
      [doc.id]
    )
    const sections = await listSections(doc.id)

    // Section tags for every active lens at once: union per-lens results.
    const sectionTagsAcc: BundleDocument['sectionTags'] = []
    for (const lens of allLenses) {
      const tagMap = await getSectionTagsForDocument(doc.id, lens.id)
      for (const [sectionId, { valueId, confidence }] of tagMap) {
        const section = sections.find((s) => s.id === sectionId)
        if (!section) continue
        const valueName = valueIdToName.get(valueId)
        if (!valueName) continue
        sectionTagsAcc.push({
          sectionIndex: section.sectionIndex,
          lensName: lens.name,
          valueName,
          confidence,
        })
      }
    }

    // Optional file inclusion. Read via the existing preload IPC.
    let bundledFile: string | null = null
    if (includeFiles && doc.filePath && window.electron) {
      try {
        const buffer = await window.electron.readFile(doc.filePath)
        const dot = doc.filename.lastIndexOf('.')
        const ext = dot > 0 ? doc.filename.slice(dot) : ''
        const inZipName = `${doc.fileHash}${ext}`
        zip.folder('files')!.file(inZipName, buffer)
        bundledFile = inZipName
        filesBytes += buffer.byteLength
        actuallyIncludedFiles = true
      } catch {
        // Source file missing on disk — bundle metadata only.
        bundledFile = null
      }
    }

    bundleDocuments.push({
      fileHash: doc.fileHash,
      filename: doc.filename,
      fileSize: doc.fileSize,
      title: doc.title,
      year: doc.year,
      company: doc.company,
      sector: doc.sector,
      pageCount: doc.pageCount,
      wordCount: doc.wordCount,
      extractedText: doc.extractedText,
      pdfMetadata: doc.pdfMetadata,
      status: doc.status,
      importedAt: doc.importedAt,
      extractedAt: doc.extractedAt,
      pages: pages.map((p) => ({ pageNumber: p.page_number, text: p.text })),
      sections: sections.map((s) => ({
        sectionIndex: s.sectionIndex,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
        text: s.text,
        classifiedAt: s.classifiedAt,
      })),
      sectionTags: sectionTagsAcc,
      bundledFile,
    })
  }

  // --- Project record -------------------------------------------------------
  const bundleProject: BundleProject = {
    name: project.name,
    description: project.description,
    researchFocus: project.researchFocus,
    scoringRuleName,
  }

  // --- Manifest -------------------------------------------------------------
  const manifest: BundleManifest = {
    bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exporterAppVersion: await getAppVersion(),
    projectName: project.name,
    counts: {
      documents: bundleDocuments.length,
      keywordLists: bundleKeywordLists.length,
      keywords: totalKeywords,
      synonyms: totalSynonyms,
      lenses: bundleLenses.length,
      scoringRules: scoringRules.length,
    },
    filesIncluded: actuallyIncludedFiles,
    filesBytes,
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('project.json', JSON.stringify(bundleProject, null, 2))
  zip.file('keyword-lists.json', JSON.stringify(bundleKeywordLists, null, 2))
  zip.file('lenses.json', JSON.stringify(bundleLenses, null, 2))
  zip.file('scoring-rules.json', JSON.stringify(scoringRules, null, 2))
  zip.file('documents.json', JSON.stringify(bundleDocuments, null, 2))

  const blob = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  await electron.writeFile(dialog.filePath, blob)

  return { filePath: dialog.filePath }
}

// ---------------------------------------------------------------------------
// Bundle scoring-rule shape (mirrors data.ts ScoringRule but with names)
// ---------------------------------------------------------------------------

export interface BundleScoringRule {
  name: string
  description: string | null
  isBuiltin: boolean
  /** Re-scoped to names so it survives ID remapping on import. */
  definition: Record<string, unknown>
  outputLevels: ScoringRule['outputLevels']
}

function serializeScoringRule(
  rule: ScoringRule,
  lensIdToName: Map<string, string>,
  valueIdToName: Map<string, string>
): BundleScoringRule {
  // Walk the definition object and rewrite any *LensId / *ValueId fields
  // to *LensName / *ValueName equivalents using the lookup maps. The
  // current Wedding Cake rule uses pillarLensId, functionLensId, and a
  // requiredPillars: string[] list (already names). Generic walker keeps
  // future rules forward-compatible.
  const def = rule.definition as Record<string, unknown> | null
  const remapped: Record<string, unknown> = {}
  if (def) {
    for (const [k, v] of Object.entries(def)) {
      if (typeof v === 'string') {
        if (k.endsWith('LensId') && lensIdToName.has(v)) {
          remapped[k.replace(/Id$/, 'Name')] = lensIdToName.get(v)
          continue
        }
        if (k.endsWith('ValueId') && valueIdToName.has(v)) {
          remapped[k.replace(/Id$/, 'Name')] = valueIdToName.get(v)
          continue
        }
      }
      remapped[k] = v
    }
  }
  return {
    name: rule.name,
    description: rule.description,
    isBuiltin: rule.isBuiltin,
    definition: remapped,
    outputLevels: rule.outputLevels,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function suggestBundleFilename(project: Project): string {
  const safe = project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')
  const date = new Date().toISOString().slice(0, 10)
  return `${safe || 'project'}-${date}.lens`
}

async function getAppVersion(): Promise<string> {
  try {
    return (await window.electron?.getVersion()) ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

async function getProjectDocuments(projectId: string): Promise<Document[]> {
  const rows = await selectAll<DocumentRow>('documents.byProjectImportOrder', [projectId])
  return rows.map(rowToDocument)
}

async function getProjectKeywordLists(projectId: string): Promise<KeywordList[]> {
  const rows = await selectAll<KeywordListRow>('keywordLists.byProject', [projectId])
  return rows.map(rowToKeywordList)
}

async function getProjectLenses(projectId: string): Promise<Lens[]> {
  const rows = await selectAll<LensRow>('lenses.byProject', [projectId])
  return rows.map(rowToLens)
}

// ---------------------------------------------------------------------------
// Row → domain mappers (match the shapes used in the matching service files)
// ---------------------------------------------------------------------------

interface KeywordListRow {
  id: string
  name: string
  description: string | null
  type: KeywordList['type']
  source: string | null
  parent_list_id: string | null
  created_at: string
  updated_at: string
}

function rowToKeywordList(row: KeywordListRow): KeywordList {
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

interface LensRow {
  id: string
  name: string
  description: string | null
  type: Lens['type']
  is_hierarchical: number
  is_builtin: number
  created_at: string
}

function rowToLens(row: LensRow): Lens {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    isHierarchical: Boolean(row.is_hierarchical),
    isBuiltin: Boolean(row.is_builtin),
    createdAt: row.created_at,
  }
}
