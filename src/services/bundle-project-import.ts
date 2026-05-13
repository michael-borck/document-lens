/**
 * Project bundle import — reads a `.lens` ZIP produced by
 * bundle-project-export.ts and recreates the project locally.
 *
 * Identity strategy:
 *
 *   - Built-in lenses (isBuiltin=true) and the seeded SDG keyword
 *     list (source='SDGs (Universities)') and the Wedding Cake
 *     scoring rule (name='5-level Wedding Cake Score') are MATCHED
 *     to the local copy by their stable identifiers. Same content,
 *     no duplication.
 *   - Custom lenses, custom keyword lists, and custom scoring rules
 *     get fresh IDs on import. Name collisions are resolved with a
 *     " (imported)" / " (imported 2)" suffix.
 *   - Documents are MATCHED by file_hash. If the hash already exists
 *     locally, the existing row is reused (no duplicate). If the
 *     bundle includes the source file, its bytes are written to
 *     userData/lens-imports/{hash}.{ext} and a fresh document row is
 *     created pointing at it. If the bundle is metadata-only (no
 *     bundled file) and the hash is unknown, the document is created
 *     with a synthetic file_path that flags it as "source unavailable"
 *     — the user can re-import the source file later from Library.
 *
 * Sections + section_lens_tags + per-page text are restored against
 * the new IDs so all the workflow analyses (Read sections, Audit
 * confirmations, Coverage, Map, etc.) work immediately on the
 * imported project.
 *
 * The import is NOT atomic at the SQL level (sqlite3 doesn't expose
 * transactions through the IPC bridge). Failures mid-import leave
 * partial state behind — the user can delete the half-imported
 * project from the Projects page.
 */

import JSZip from 'jszip'
import { runStatement, selectOne, selectAll, newId, toDbBool, stringifyJson } from './db'
import {
  createProject,
  addDocumentsToProject,
  setProjectKeywordList,
  setProjectLenses,
  updateProject,
} from './projects'
import {
  createKeywordList,
  createKeyword,
  createSynonym,
  setKeywordListLenses,
  setKeywordTag,
  listKeywordLists,
} from './keyword-lists'
import {
  createLens,
  createLensValue,
  listLenses,
  listLensValues,
} from './lenses'
import { createScoringRule, listScoringRules } from './scoring-rules'
import { getDocumentByHash } from './documents'
import { setSectionTag } from './sections'
import {
  BUNDLE_SCHEMA_VERSION,
  type BundleManifest,
  type BundleProject,
  type BundleKeywordList,
  type BundleLens,
  type BundleScoringRule,
  type BundleDocument,
} from './bundle-project-export'
import type { Project, KeywordList, Lens, LensValue, ScoringRule } from '@/types/data'

export interface BundlePreview {
  manifest: BundleManifest
  project: BundleProject
  /** What will happen on apply — counts of new vs reused entities. */
  plan: {
    newLenses: number
    reusedLenses: number
    newKeywordLists: number
    reusedKeywordLists: number
    newScoringRules: number
    reusedScoringRules: number
    newDocuments: number
    reusedDocuments: number
  }
  /** Warnings (non-fatal) the user should see before clicking Import. */
  warnings: string[]
}

export interface ImportResult {
  project: Project
  newDocumentCount: number
  reusedDocumentCount: number
  newKeywordCount: number
  newLensCount: number
}

// ---------------------------------------------------------------------------
// Step 1: read + preview the bundle (no DB writes)
// ---------------------------------------------------------------------------

export async function readBundlePreview(bundlePath: string): Promise<BundlePreview> {
  const electron = window.electron
  if (!electron) throw new Error('Electron API not available')

  const buffer = await electron.readFile(bundlePath)
  const zip = await JSZip.loadAsync(buffer)

  const manifest = await readJson<BundleManifest>(zip, 'manifest.json')
  if (!manifest || typeof manifest.bundleSchemaVersion !== 'number') {
    throw new Error('Bundle manifest missing or malformed — not a Document Lens bundle?')
  }
  if (manifest.bundleSchemaVersion > BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Bundle was exported with a newer Document Lens version ` +
      `(bundle schema ${manifest.bundleSchemaVersion}, this app supports up to ${BUNDLE_SCHEMA_VERSION}). ` +
      `Update the app and try again.`
    )
  }

  const project = await readJson<BundleProject>(zip, 'project.json')
  const lenses = (await readJson<BundleLens[]>(zip, 'lenses.json')) ?? []
  const keywordLists = (await readJson<BundleKeywordList[]>(zip, 'keyword-lists.json')) ?? []
  const scoringRules = (await readJson<BundleScoringRule[]>(zip, 'scoring-rules.json')) ?? []
  const documents = (await readJson<BundleDocument[]>(zip, 'documents.json')) ?? []

  if (!project) throw new Error('Bundle project.json missing')

  // Compute new vs reused counts by checking what the local DB already has.
  const [localLenses, localKeywordLists, localScoringRules] = await Promise.all([
    listLenses(),
    listKeywordLists(),
    listScoringRules(),
  ])

  let newLenses = 0
  let reusedLenses = 0
  for (const l of lenses) {
    if (resolveExistingLens(l, localLenses)) reusedLenses++
    else newLenses++
  }

  let newKeywordLists = 0
  let reusedKeywordLists = 0
  for (const kl of keywordLists) {
    if (resolveExistingKeywordList(kl, localKeywordLists)) reusedKeywordLists++
    else newKeywordLists++
  }

  let newScoringRules = 0
  let reusedScoringRules = 0
  for (const sr of scoringRules) {
    if (resolveExistingScoringRule(sr, localScoringRules)) reusedScoringRules++
    else newScoringRules++
  }

  let newDocuments = 0
  let reusedDocuments = 0
  for (const doc of documents) {
    const existing = await getDocumentByHash(doc.fileHash)
    if (existing) reusedDocuments++
    else newDocuments++
  }

  const warnings: string[] = []
  const docsWithoutFiles = documents.filter((d) => !d.bundledFile)
  if (!manifest.filesIncluded && docsWithoutFiles.length > 0) {
    warnings.push(
      `Bundle does not include source files (${docsWithoutFiles.length} doc${docsWithoutFiles.length === 1 ? '' : 's'} affected). ` +
      `Analysis will work but Preview / Open source will be unavailable until you re-import the original files.`
    )
  }

  return {
    manifest,
    project,
    plan: {
      newLenses,
      reusedLenses,
      newKeywordLists,
      reusedKeywordLists,
      newScoringRules,
      reusedScoringRules,
      newDocuments,
      reusedDocuments,
    },
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Step 2: apply the bundle (creates a new project + everything attached)
// ---------------------------------------------------------------------------

export interface ImportProgress {
  phase: 'lenses' | 'keywords' | 'scoring-rules' | 'documents' | 'sections' | 'project'
  current: number
  total: number
  message: string
}

export async function applyBundle(
  bundlePath: string,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const electron = window.electron
  if (!electron) throw new Error('Electron API not available')

  const buffer = await electron.readFile(bundlePath)
  const zip = await JSZip.loadAsync(buffer)

  const manifest = await readJson<BundleManifest>(zip, 'manifest.json')
  const project = await readJson<BundleProject>(zip, 'project.json')
  const bundleLenses = (await readJson<BundleLens[]>(zip, 'lenses.json')) ?? []
  const bundleKeywordLists = (await readJson<BundleKeywordList[]>(zip, 'keyword-lists.json')) ?? []
  const bundleScoringRules = (await readJson<BundleScoringRule[]>(zip, 'scoring-rules.json')) ?? []
  const bundleDocuments = (await readJson<BundleDocument[]>(zip, 'documents.json')) ?? []

  if (!manifest || !project) throw new Error('Bundle is missing required files')

  // ----- Lenses ------------------------------------------------------------
  // lensName → local lens id (after match-or-create)
  const lensNameToId = new Map<string, string>()
  // (lensName, valueName) → local value id (after match-or-create)
  const lensValueIdByPath = new Map<string, string>()  // key: `${lensName}\x1f${valueName}`

  const localLenses = await listLenses()
  let lensIdx = 0
  for (const bl of bundleLenses) {
    onProgress?.({
      phase: 'lenses',
      current: ++lensIdx,
      total: bundleLenses.length,
      message: bl.name,
    })

    const existing = resolveExistingLens(bl, localLenses)
    let lensId: string
    if (existing) {
      lensId = existing.id
      // Reuse — load existing values into the path map.
      const existingValues = await listLensValues(lensId)
      for (const v of existingValues) {
        lensValueIdByPath.set(`${bl.name}\x1f${v.value}`, v.id)
      }
    } else {
      const created = await createLens({
        name: uniqueName(bl.name, localLenses.map((l) => l.name)),
        description: bl.description ?? undefined,
        type: bl.type,
        isHierarchical: bl.isHierarchical,
        isBuiltin: false,  // imported customs are never built-in
      })
      lensId = created.id
      // Create values; resolve hierarchy parent in a second pass so
      // child-before-parent ordering doesn't matter.
      const createdValuesByName = new Map<string, LensValue>()
      for (const v of bl.values) {
        const cv = await createLensValue({
          lensId,
          value: v.value,
          displayName: v.displayName ?? undefined,
          description: v.description ?? undefined,
          sortOrder: v.sortOrder,
        })
        createdValuesByName.set(v.value, cv)
        lensValueIdByPath.set(`${bl.name}\x1f${v.value}`, cv.id)
      }
      // Hierarchy fix-up.
      for (const v of bl.values) {
        if (!v.parentValueName) continue
        const child = createdValuesByName.get(v.value)
        const parent = createdValuesByName.get(v.parentValueName)
        if (child && parent) {
          await runStatement(
            'UPDATE lens_values SET parent_value_id = ? WHERE id = ?',
            [parent.id, child.id]
          )
        }
      }
    }
    lensNameToId.set(bl.name, lensId)
  }

  // ----- Keyword lists -----------------------------------------------------
  const localKeywordLists = await listKeywordLists()
  // bundle list name → local list id
  const keywordListNameToId = new Map<string, string>()
  let newKeywordCount = 0
  let listIdx = 0
  for (const bkl of bundleKeywordLists) {
    onProgress?.({
      phase: 'keywords',
      current: ++listIdx,
      total: bundleKeywordLists.length,
      message: bkl.name,
    })

    const existing = resolveExistingKeywordList(bkl, localKeywordLists)
    let listId: string
    if (existing) {
      // Reuse — don't add bundle keywords (would mass-duplicate the
      // SDG list when sharing sustainability projects).
      listId = existing.id
    } else {
      const created = await createKeywordList({
        name: uniqueName(bkl.name, localKeywordLists.map((l) => l.name)),
        description: bkl.description ?? undefined,
        type: bkl.type,
        source: bkl.source ?? undefined,
      })
      listId = created.id

      // Declare the list's lenses (resolved to new IDs).
      const declaredLensIds = bkl.declaredLenses
        .map((name) => lensNameToId.get(name))
        .filter((id): id is string => Boolean(id))
      if (declaredLensIds.length > 0) {
        await setKeywordListLenses(listId, declaredLensIds)
      }

      // Create keywords + synonyms + tags.
      for (const bk of bkl.keywords) {
        const keyword = await createKeyword({
          listId,
          text: bk.text,
          polarity: bk.polarity,
          enabled: bk.enabled,
          notes: bk.notes ?? undefined,
          sortOrder: bk.sortOrder,
        })
        newKeywordCount++

        // Tags
        for (const tag of bk.tags) {
          const lensId = lensNameToId.get(tag.lensName)
          const valueId = lensValueIdByPath.get(`${tag.lensName}\x1f${tag.valueName}`)
          if (lensId && valueId) {
            await setKeywordTag(keyword.id, lensId, valueId)
          }
        }

        // Synonyms
        for (const syn of bk.synonyms) {
          await createSynonym({
            keywordId: keyword.id,
            text: syn.text,
            source: syn.source,
          })
        }
      }
    }
    keywordListNameToId.set(bkl.name, listId)
  }

  // ----- Scoring rules -----------------------------------------------------
  const localScoringRules = await listScoringRules()
  let scoringRuleId: string | null = null
  let scoringIdx = 0
  for (const bsr of bundleScoringRules) {
    onProgress?.({
      phase: 'scoring-rules',
      current: ++scoringIdx,
      total: bundleScoringRules.length,
      message: bsr.name,
    })

    const existing = resolveExistingScoringRule(bsr, localScoringRules)
    let ruleId: string
    if (existing) {
      ruleId = existing.id
    } else {
      // Rewrite *Name back to *Id using lensNameToId / lensValueIdByPath.
      const remappedDef: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(bsr.definition)) {
        if (typeof v === 'string') {
          if (k.endsWith('LensName') && lensNameToId.has(v)) {
            remappedDef[k.replace(/Name$/, 'Id')] = lensNameToId.get(v)
            continue
          }
          if (k.endsWith('ValueName')) {
            // Need to know the lens to look up the value — for now skip
            // fancy lookup and pass the name through (current Wedding
            // Cake rule doesn't use *ValueName fields).
            remappedDef[k] = v
            continue
          }
        }
        remappedDef[k] = v
      }
      const created = await createScoringRule({
        name: uniqueName(bsr.name, localScoringRules.map((r) => r.name)),
        description: bsr.description ?? undefined,
        isBuiltin: false,
        definition: remappedDef,
        outputLevels: bsr.outputLevels,
      })
      ruleId = created.id
    }
    if (project.scoringRuleName && bsr.name === project.scoringRuleName) {
      scoringRuleId = ruleId
    }
  }

  // ----- Documents ---------------------------------------------------------
  const documentIds: string[] = []
  let newDocumentCount = 0
  let reusedDocumentCount = 0
  let importedFilesDir: string | null = null
  let docIdx = 0
  for (const bd of bundleDocuments) {
    onProgress?.({
      phase: 'documents',
      current: ++docIdx,
      total: bundleDocuments.length,
      message: bd.title ?? bd.filename,
    })

    const existing = await getDocumentByHash(bd.fileHash)
    let docId: string
    if (existing) {
      docId = existing.id
      reusedDocumentCount++
    } else {
      // Materialise the bundled file (if present) to a stable on-disk
      // location. Otherwise create with a synthetic file_path that
      // flags the source as unavailable.
      let filePath = `lens-bundle://${bd.fileHash}`  // synthetic — Read viewer will surface "source unavailable"
      if (bd.bundledFile && manifest.filesIncluded) {
        if (!importedFilesDir) {
          const userDataPath = await electron.getPath('userData')
          importedFilesDir = `${userDataPath}/lens-imports`
        }
        const fileBytes = await zip.file(`files/${bd.bundledFile}`)?.async('arraybuffer')
        if (fileBytes) {
          const targetPath = `${importedFilesDir}/${bd.bundledFile}`
          await electron.writeFile(targetPath, fileBytes)
          filePath = targetPath
        }
      }

      docId = newId()
      await runStatement(
        `INSERT INTO documents
           (id, filename, file_path, file_hash, file_size, title, year, company, sector,
            page_count, word_count, extracted_text, pdf_metadata, status, status_error,
            imported_at, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          bd.filename,
          filePath,
          bd.fileHash,
          bd.fileSize,
          bd.title,
          bd.year,
          bd.company,
          bd.sector,
          bd.pageCount,
          bd.wordCount,
          bd.extractedText,
          bd.pdfMetadata ? stringifyJson(bd.pdfMetadata) : null,
          bd.status,
          null,
          bd.importedAt,
          bd.extractedAt,
        ]
      )
      newDocumentCount++

      // Per-page text.
      for (const page of bd.pages) {
        await runStatement(
          'INSERT INTO document_pages (document_id, page_number, text) VALUES (?, ?, ?)',
          [docId, page.pageNumber, page.text]
        )
      }

      // Sections + section tags.
      // Map old sectionIndex → new section id so tags can reference them.
      const sectionIdByIndex = new Map<number, string>()
      for (const s of bd.sections) {
        const sectionId = newId()
        await runStatement(
          `INSERT INTO document_sections
             (id, document_id, section_index, start_offset, end_offset, text, classified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [sectionId, docId, s.sectionIndex, s.startOffset, s.endOffset, s.text, s.classifiedAt]
        )
        sectionIdByIndex.set(s.sectionIndex, sectionId)
      }
      for (const tag of bd.sectionTags) {
        const sectionId = sectionIdByIndex.get(tag.sectionIndex)
        const lensId = lensNameToId.get(tag.lensName)
        const valueId = lensValueIdByPath.get(`${tag.lensName}\x1f${tag.valueName}`)
        if (sectionId && lensId && valueId) {
          await setSectionTag(sectionId, lensId, valueId, tag.confidence)
        }
      }
    }
    documentIds.push(docId)
  }

  // ----- Project -----------------------------------------------------------
  onProgress?.({
    phase: 'project',
    current: 1,
    total: 1,
    message: project.name,
  })

  const projectName = await uniqueProjectName(project.name)
  const newProject = await createProject({
    name: projectName,
    description: project.description ?? undefined,
    researchFocus: project.researchFocus ?? undefined,
  })

  if (documentIds.length > 0) {
    await addDocumentsToProject(newProject.id, documentIds)
  }

  // Active keyword list = first one referenced by the bundle.
  const activeListName = bundleKeywordLists[0]?.name
  const activeListId = activeListName ? keywordListNameToId.get(activeListName) : undefined
  if (activeListId) {
    await setProjectKeywordList(newProject.id, activeListId)
  }

  // Active lenses = all lenses referenced in the bundle.
  const activeLensIds = bundleLenses
    .map((l) => lensNameToId.get(l.name))
    .filter((id): id is string => Boolean(id))
  if (activeLensIds.length > 0) {
    await setProjectLenses(newProject.id, activeLensIds)
  }

  if (scoringRuleId) {
    await updateProject(newProject.id, { scoringRuleId })
  }

  return {
    project: newProject,
    newDocumentCount,
    reusedDocumentCount,
    newKeywordCount,
    newLensCount: bundleLenses.length - localLenses.filter((l) =>
      bundleLenses.some((bl) => resolveExistingLens(bl, [l]))
    ).length,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readJson<T>(zip: JSZip, path: string): Promise<T | null> {
  const file = zip.file(path)
  if (!file) return null
  const text = await file.async('string')
  return JSON.parse(text) as T
}

function resolveExistingLens(bundleLens: BundleLens, locals: Lens[]): Lens | null {
  // Built-in lenses are matched by name + isBuiltin flag (same content
  // regardless of who exported the bundle).
  if (bundleLens.isBuiltin) {
    return locals.find((l) => l.isBuiltin && l.name === bundleLens.name) ?? null
  }
  return null
}

function resolveExistingKeywordList(bundle: BundleKeywordList, locals: KeywordList[]): KeywordList | null {
  // The seeded SDG list is matched by stable source identifier.
  if (bundle.source) {
    const match = locals.find((l) => l.source === bundle.source)
    if (match) return match
  }
  return null
}

function resolveExistingScoringRule(bundle: BundleScoringRule, locals: ScoringRule[]): ScoringRule | null {
  if (bundle.isBuiltin) {
    return locals.find((r) => r.isBuiltin && r.name === bundle.name) ?? null
  }
  // The Wedding Cake rule was originally seeded as a "built-in" but
  // the seed creates it without isBuiltin=true on every install. Fall
  // back to name match for known seeded rules.
  if (bundle.name === '5-level Wedding Cake Score') {
    return locals.find((r) => r.name === '5-level Wedding Cake Score') ?? null
  }
  return null
}

function uniqueName(desired: string, taken: string[]): string {
  if (!taken.includes(desired)) return desired
  let n = 2
  while (taken.includes(`${desired} (imported${n === 2 ? '' : ' ' + n})`)) {
    n++
  }
  return `${desired} (imported${n === 2 ? '' : ' ' + n})`
}

async function uniqueProjectName(desired: string): Promise<string> {
  const existing = await selectAll<{ name: string }>('SELECT name FROM projects')
  const taken = existing.map((r) => r.name)
  return uniqueName(desired, taken)
}

// Suppress unused-import warning for selectOne (kept for future
// hash-collision recovery paths).
export type _Unused = typeof selectOne | typeof toDbBool
