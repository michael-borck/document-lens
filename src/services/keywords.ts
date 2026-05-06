/**
 * Keyword Service
 * 
 * Manages keyword lists including built-in frameworks and custom lists.
 */

import { v4 as uuidv4 } from 'uuid'
import * as XLSX from 'xlsx'

// Import framework data - Sustainability focus
import tcfdData from '@/data/frameworks/tcfd.json'
import sdgsData from '@/data/frameworks/sdgs.json'
import griData from '@/data/frameworks/gri.json'
import sasbData from '@/data/frameworks/sasb.json'

// Cybersecurity focus
import nistCsfData from '@/data/frameworks/nist-csf.json'
import iso27001Data from '@/data/frameworks/iso-27001.json'
import cisControlsData from '@/data/frameworks/cis-controls.json'
import mitreAttackData from '@/data/frameworks/mitre-attack.json'

// Finance focus
import financialRatiosData from '@/data/frameworks/financial-ratios.json'
import secRegulationsData from '@/data/frameworks/sec-regulations.json'
import baselIiiData from '@/data/frameworks/basel-iii.json'
import riskMetricsData from '@/data/frameworks/risk-metrics.json'

// Healthcare focus
import clinicalTrialsData from '@/data/frameworks/clinical-trials.json'
import fdaRegulationsData from '@/data/frameworks/fda-regulations.json'
import hipaaData from '@/data/frameworks/hipaa.json'
import medicalTerminologyData from '@/data/frameworks/medical-terminology.json'

// Legal focus
import contractTermsData from '@/data/frameworks/contract-terms.json'
import regulatoryLanguageData from '@/data/frameworks/regulatory-language.json'
import legalClausesData from '@/data/frameworks/legal-clauses.json'
import complianceKeywordsData from '@/data/frameworks/compliance-keywords.json'

// Academic focus
import researchMethodsData from '@/data/frameworks/research-methods.json'
import statisticalTermsData from '@/data/frameworks/statistical-terms.json'
import literatureReviewData from '@/data/frameworks/literature-review.json'
import citationAnalysisData from '@/data/frameworks/citation-analysis.json'

// Project Management focus
import agileScrumData from '@/data/frameworks/agile-scrum.json'
import pmbokData from '@/data/frameworks/pmbok.json'
import riskManagementPmData from '@/data/frameworks/risk-management-pm.json'
import resourcePlanningData from '@/data/frameworks/resource-planning.json'

// Hierarchical frameworks
import sdgsWeddingCakeData from '@/data/frameworks/sdgs-wedding-cake.json'
import sdgsWeddingCakeCounterData from '@/data/frameworks/sdgs-wedding-cake-counter.json'

// General domain keyword lists (non-framework-specific)
import sustainabilityGeneralData from '@/data/frameworks/sustainability-general.json'
import cybersecurityGeneralData from '@/data/frameworks/cybersecurity-general.json'
import financeGeneralData from '@/data/frameworks/finance-general.json'
import healthcareGeneralData from '@/data/frameworks/healthcare-general.json'
import legalGeneralData from '@/data/frameworks/legal-general.json'
import academicGeneralData from '@/data/frameworks/academic-general.json'
import projectManagementGeneralData from '@/data/frameworks/project-management-general.json'

export interface FrameworkData {
  name: string
  framework: string
  version: string
  description: string
  source: string
  list_type: 'simple' | 'grouped' | 'weighted' | 'hierarchical'
  total_keywords: number
  keywords: Record<string, string[]> | string[] | Array<{ term: string; weight: number }>
  // Hierarchical fields (only when list_type === 'hierarchical')
  tiers?: string[]
  tree?: HierarchyNode
}

export interface KeywordList {
  id: string
  name: string
  description: string | null
  framework: string | null
  focus: string | null
  list_type: string
  keywords: string // JSON string
  is_builtin: boolean
  created_at: string
  updated_at: string
}

export interface ParsedKeywordList extends Omit<KeywordList, 'keywords'> {
  keywords: Record<string, string[]> | string[]
  totalCount: number
  // Hierarchical data (only when list_type === 'hierarchical')
  hierarchical?: HierarchicalKeywords
}

/**
 * Recursive tree node: either nested categories or leaf keyword arrays.
 * Supports arbitrary depth.
 */
export interface HierarchyNode {
  [category: string]: HierarchyNode | string[]
}

/**
 * Parsed hierarchical keyword structure with named tiers.
 */
export interface HierarchicalKeywords {
  tiers: string[]        // Named levels, e.g. ["Pillar", "Goal"]
  tree: HierarchyNode    // The nested tree structure
}

/**
 * Check if a value is a leaf node (string array) vs nested node
 */
function isLeafNode(value: HierarchyNode | string[]): value is string[] {
  return Array.isArray(value)
}

/**
 * Flatten a hierarchy tree into a single array of all keywords
 */
export function flattenHierarchy(node: HierarchyNode): string[] {
  const result: string[] = []
  for (const value of Object.values(node)) {
    if (isLeafNode(value)) {
      result.push(...value)
    } else {
      result.push(...flattenHierarchy(value))
    }
  }
  return result
}

/**
 * Aggregate keywords by category at a specific tier depth.
 * depth=0 returns top-level categories, depth=1 returns second-level, etc.
 * Returns a map of category name → flat keyword array beneath it.
 */
export function aggregateAtTier(tree: HierarchyNode, depth: number): Record<string, string[]> {
  if (depth === 0) {
    const result: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(tree)) {
      result[key] = isLeafNode(value) ? value : flattenHierarchy(value)
    }
    return result
  }

  // Go one level deeper
  const result: Record<string, string[]> = {}
  for (const value of Object.values(tree)) {
    if (!isLeafNode(value)) {
      const sub = aggregateAtTier(value, depth - 1)
      Object.assign(result, sub)
    }
  }
  return result
}



// Framework data map
const FRAMEWORKS: Record<string, FrameworkData> = {
  // Sustainability
  tcfd: tcfdData as FrameworkData,
  sdgs: sdgsData as FrameworkData,
  gri: griData as FrameworkData,
  sasb: sasbData as FrameworkData,
  // Cybersecurity
  'nist-csf': nistCsfData as FrameworkData,
  'iso-27001': iso27001Data as FrameworkData,
  'cis-controls': cisControlsData as FrameworkData,
  'mitre-attack': mitreAttackData as FrameworkData,
  // Finance
  'financial-ratios': financialRatiosData as FrameworkData,
  'sec-regulations': secRegulationsData as FrameworkData,
  'basel-iii': baselIiiData as FrameworkData,
  'risk-metrics': riskMetricsData as FrameworkData,
  // Healthcare
  'clinical-trials': clinicalTrialsData as FrameworkData,
  'fda-regulations': fdaRegulationsData as FrameworkData,
  'hipaa': hipaaData as FrameworkData,
  'medical-terminology': medicalTerminologyData as FrameworkData,
  // Legal
  'contract-terms': contractTermsData as FrameworkData,
  'regulatory-language': regulatoryLanguageData as FrameworkData,
  'legal-clauses': legalClausesData as FrameworkData,
  'compliance-keywords': complianceKeywordsData as FrameworkData,
  // Academic
  'research-methods': researchMethodsData as FrameworkData,
  'statistical-terms': statisticalTermsData as FrameworkData,
  'literature-review': literatureReviewData as FrameworkData,
  'citation-analysis': citationAnalysisData as FrameworkData,
  // Project Management
  'agile-scrum': agileScrumData as FrameworkData,
  'pmbok': pmbokData as FrameworkData,
  'risk-management-pm': riskManagementPmData as FrameworkData,
  'resource-planning': resourcePlanningData as FrameworkData,
  // Hierarchical frameworks
  'sdgs-wedding-cake': sdgsWeddingCakeData as unknown as FrameworkData,
  'sdgs-wedding-cake-counter': sdgsWeddingCakeCounterData as unknown as FrameworkData,
  // General domain keywords (non-framework-specific)
  'sustainability-general': sustainabilityGeneralData as FrameworkData,
  'cybersecurity-general': cybersecurityGeneralData as FrameworkData,
  'finance-general': financeGeneralData as FrameworkData,
  'healthcare-general': healthcareGeneralData as FrameworkData,
  'legal-general': legalGeneralData as FrameworkData,
  'academic-general': academicGeneralData as FrameworkData,
  'project-management-general': projectManagementGeneralData as FrameworkData,
}

/**
 * Seed built-in framework keyword lists into the database
 * Note: Primary seeding now happens in the main process (electron/database.ts)
 * This function serves as a verification/fallback for the renderer
 */
export async function seedFrameworkKeywords(): Promise<void> {
  try {
    // Check if already seeded (should be done by main process)
    const existing = await window.electron.dbQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM keyword_lists WHERE is_builtin = 1'
    )
    
    if (existing && existing[0] && existing[0].count > 0) {
      console.log(`Framework keywords verified: ${existing[0].count} found in database`)
      return
    }

    // Fallback: seed from renderer if main process didn't seed
    console.warn('Framework keywords not found in database, attempting fallback seeding...')
    
    for (const [key, data] of Object.entries(FRAMEWORKS)) {
      try {
        const id = uuidv4()
        await window.electron.dbRun(
          `INSERT INTO keyword_lists (id, name, description, framework, list_type, keywords, is_builtin)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [id, data.name, data.description, key, data.list_type, JSON.stringify(data.keywords)]
        )
        console.log(`Fallback seeded: ${data.name}`)
      } catch (insertError) {
        console.error(`Failed to insert framework ${key}:`, insertError)
      }
    }
    
    // Verify
    const verifyCount = await window.electron.dbQuery<{ count: number }>(
      'SELECT COUNT(*) as count FROM keyword_lists WHERE is_builtin = 1'
    )
    console.log(`Fallback seeding complete: ${verifyCount[0]?.count || 0} framework keyword lists`)
    
  } catch (error) {
    console.error('Failed to verify/seed framework keywords:', error)
  }
}

/**
 * Restore any missing built-in keyword lists.
 * Checks each framework against the database and re-seeds any that are missing.
 * Returns count of restored lists.
 */
export async function restoreDefaultKeywordLists(): Promise<number> {
  let restored = 0

  // Get existing built-in framework IDs
  const existing = await window.electron.dbQuery<{ framework: string }>(
    'SELECT framework FROM keyword_lists WHERE is_builtin = 1'
  )
  const existingIds = new Set(existing.map(r => r.framework))

  for (const [key, data] of Object.entries(FRAMEWORKS)) {
    if (!existingIds.has(key)) {
      try {
        const id = uuidv4()
        await window.electron.dbRun(
          `INSERT INTO keyword_lists (id, name, description, framework, list_type, keywords, is_builtin)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [id, data.name, data.description, key, data.list_type, JSON.stringify(data.keywords)]
        )
        console.log(`Restored built-in keyword list: ${data.name}`)
        restored++
      } catch (error) {
        console.error(`Failed to restore ${key}:`, error)
      }
    }
  }

  return restored
}

/**
 * Get all keyword lists
 */
export async function getAllKeywordLists(): Promise<KeywordList[]> {
  return window.electron.dbQuery<KeywordList>(
    'SELECT * FROM keyword_lists ORDER BY is_builtin DESC, name ASC'
  )
}

/**
 * Get keyword list by ID
 */
export async function getKeywordList(id: string): Promise<KeywordList | null> {
  const results = await window.electron.dbQuery<KeywordList>(
    'SELECT * FROM keyword_lists WHERE id = ?',
    [id]
  )
  return results[0] || null
}

/**
 * Parse keywords from JSON string
 */
export function parseKeywords(list: KeywordList): ParsedKeywordList {
  const raw = JSON.parse(list.keywords)

  // Handle hierarchical type
  if (list.list_type === 'hierarchical' && raw.tree && raw.tiers) {
    const hierarchical: HierarchicalKeywords = {
      tiers: raw.tiers,
      tree: raw.tree,
    }
    // Flatten the tree to produce the standard keywords format (grouped at the deepest tier)
    const deepestTier = raw.tiers.length - 1
    const grouped = aggregateAtTier(raw.tree, deepestTier)
    const totalCount = Object.values(grouped).flat().length

    return {
      ...list,
      keywords: grouped,
      totalCount,
      hierarchical,
    }
  }

  // Standard types
  let totalCount = 0
  if (Array.isArray(raw)) {
    totalCount = raw.length
  } else if (typeof raw === 'object') {
    totalCount = Object.values(raw).flat().length
  }

  return {
    ...list,
    keywords: raw,
    totalCount,
  }
}

/**
 * Get all keywords as a flat array
 */
export function flattenKeywords(keywords: Record<string, string[]> | string[]): string[] {
  if (Array.isArray(keywords)) {
    return keywords
  }
  return Object.values(keywords).flat()
}

/**
 * Get keywords grouped by category
 */
export function getKeywordsByCategory(keywords: Record<string, string[]> | string[]): Record<string, string[]> {
  if (Array.isArray(keywords)) {
    return { 'All Keywords': keywords }
  }
  return keywords
}

/**
 * Create a new custom keyword list
 */
/**
 * Check if a keyword list name already exists
 */
export async function checkKeywordListNameExists(name: string): Promise<{ exists: boolean; isBuiltin: boolean }> {
  const results = await window.electron.dbQuery<{ is_builtin: number }>(
    'SELECT is_builtin FROM keyword_lists WHERE name = ? LIMIT 1',
    [name]
  )
  if (results.length === 0) return { exists: false, isBuiltin: false }
  return { exists: true, isBuiltin: results[0].is_builtin === 1 }
}

export async function createKeywordList(
  name: string,
  description: string | null,
  listType: 'simple' | 'grouped' | 'hierarchical',
  keywords: Record<string, string[]> | string[] | { tiers: string[]; tree: HierarchyNode }
): Promise<string> {
  const id = uuidv4()
  await window.electron.dbRun(
    `INSERT INTO keyword_lists (id, name, description, framework, list_type, keywords, is_builtin)
     VALUES (?, ?, ?, 'custom', ?, ?, 0)`,
    [id, name, description, listType, JSON.stringify(keywords)]
  )
  return id
}

/**
 * Update a custom keyword list
 */
export async function updateKeywordList(
  id: string,
  updates: {
    name?: string
    description?: string | null
    keywords?: Record<string, string[]> | string[]
  }
): Promise<void> {
  const setClauses: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    setClauses.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?')
    values.push(updates.description)
  }
  if (updates.keywords !== undefined) {
    setClauses.push('keywords = ?')
    values.push(JSON.stringify(updates.keywords))
  }
  
  setClauses.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  await window.electron.dbRun(
    `UPDATE keyword_lists SET ${setClauses.join(', ')} WHERE id = ? AND is_builtin = 0`,
    values
  )
}

/**
 * Delete a custom keyword list
 */
export async function deleteKeywordList(id: string): Promise<void> {
  // Clean up cached keyword results referencing this list
  await window.electron.dbRun(
    'DELETE FROM keyword_results WHERE keyword_list_id = ?',
    [id]
  )
  await window.electron.dbRun(
    'DELETE FROM keyword_lists WHERE id = ? AND is_builtin = 0',
    [id]
  )
}

/**
 * Duplicate a keyword list (creates a custom copy)
 */
export async function duplicateKeywordList(
  sourceId: string,
  newName: string
): Promise<string> {
  const source = await getKeywordList(sourceId)
  if (!source) {
    throw new Error('Source list not found')
  }

  const id = uuidv4()
  await window.electron.dbRun(
    `INSERT INTO keyword_lists (id, name, description, framework, list_type, keywords, is_builtin)
     VALUES (?, ?, ?, 'custom', ?, ?, 0)`,
    [
      id,
      newName,
      `Copy of ${source.name}`,
      source.list_type,
      source.keywords,
    ]
  )
  return id
}

/**
 * Import keywords from CSV
 * Expects format: keyword (one per line) or category,keyword
 */
export function parseKeywordsFromCSV(
  csvContent: string,
  hasCategories: boolean = false
): Record<string, string[]> | string[] {
  const lines = csvContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))

  if (!hasCategories) {
    return lines
  }

  const grouped: Record<string, string[]> = {}
  
  for (const line of lines) {
    const [category, keyword] = line.split(',').map(s => s.trim())
    if (category && keyword) {
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(keyword)
    }
  }

  return grouped
}

/**
 * Parse an Excel file into a keyword list.
 * Auto-detects hierarchy from column structure:
 * - 1 column: simple list
 * - 2 columns: grouped (category, keyword)
 * - 3+ columns: hierarchical (tier1, tier2, ..., keyword, [note])
 *
 * Returns the detected structure and data for preview before import.
 */
export interface ExcelImportPreview {
  listType: 'simple' | 'grouped' | 'hierarchical'
  tierNames: string[]
  keywords: string[] | Record<string, string[]> | { tiers: string[]; tree: HierarchyNode }
  totalKeywords: number
  sheets: string[]
  /** Top-level categories for preview */
  topCategories: string[]
}

export function parseKeywordsFromExcel(
  buffer: ArrayBuffer,
): ExcelImportPreview {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheets = workbook.SheetNames

  // Use the first sheet
  const sheetName = sheets[0]
  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]
  const rows = rawRows.filter(row => row.some(cell => cell && String(cell).trim()))

  if (rows.length === 0) {
    return { listType: 'simple', tierNames: [], keywords: [], totalKeywords: 0, sheets, topCategories: [] }
  }

  // Detect column count (ignoring trailing empty columns and note columns)
  const firstRow = rows[0].map(c => String(c).trim())

  // Heuristic: look at all rows to find the max meaningful columns
  // A "note" column usually has longer text and appears last
  let maxCols = 0
  for (const row of rows.slice(0, 20)) {
    let nonEmpty = 0
    for (const cell of row) {
      if (String(cell).trim()) nonEmpty = row.indexOf(cell) + 1
    }
    maxCols = Math.max(maxCols, nonEmpty)
  }

  // Check if last column looks like notes (long text, different from others)
  const lastColValues = rows.slice(0, 10).map(r => String(r[maxCols - 1] || '').trim())
  const avgLastColLen = lastColValues.reduce((s, v) => s + v.length, 0) / lastColValues.length
  const hasNoteColumn = maxCols >= 3 && avgLastColLen > 20

  const dataCols = hasNoteColumn ? maxCols - 1 : maxCols

  if (dataCols <= 1) {
    // Simple list
    const keywords = rows.map(r => String(r[0]).trim()).filter(k => k)
    return { listType: 'simple', tierNames: [], keywords, totalKeywords: keywords.length, sheets, topCategories: [] }
  }

  if (dataCols === 2) {
    // Grouped: column 0 = category, column 1 = keyword
    const grouped: Record<string, string[]> = {}
    for (const row of rows) {
      const category = String(row[0]).trim()
      const keyword = String(row[1]).trim()
      if (category && keyword) {
        if (!grouped[category]) grouped[category] = []
        grouped[category].push(keyword)
      }
    }
    const totalKeywords = Object.values(grouped).flat().length
    return {
      listType: 'grouped',
      tierNames: [],
      keywords: grouped,
      totalKeywords,
      sheets,
      topCategories: Object.keys(grouped),
    }
  }

  // 3+ data columns: hierarchical
  // Columns before the last data column are tiers, last data column is keywords
  const tierCount = dataCols - 1
  const tierNames = Array.from({ length: tierCount }, (_, i) => `Tier ${i + 1}`)

  // Build the tree
  const tree: HierarchyNode = {}
  for (const row of rows) {
    const tiers = Array.from({ length: tierCount }, (_, i) => String(row[i] || '').trim())
    const keyword = String(row[tierCount] || '').trim()
    if (!keyword) continue

    // Navigate/create the tree path
    let current: HierarchyNode = tree
    for (let i = 0; i < tiers.length - 1; i++) {
      const tierValue = tiers[i] || 'Uncategorized'
      if (!current[tierValue]) current[tierValue] = {}
      const next = current[tierValue]
      if (Array.isArray(next)) {
        // Shouldn't happen with proper data, but handle gracefully
        current[tierValue] = { Uncategorized: next }
        current = current[tierValue] as HierarchyNode
      } else {
        current = next
      }
    }

    // Last tier level → keyword array
    const lastTier = tiers[tiers.length - 1] || 'Uncategorized'
    if (!current[lastTier]) current[lastTier] = []
    const leaf = current[lastTier]
    if (Array.isArray(leaf)) {
      leaf.push(keyword)
    }
  }

  const totalKeywords = flattenHierarchy(tree).length
  const topCategories = Object.keys(tree)

  return {
    listType: 'hierarchical',
    tierNames,
    keywords: { tiers: tierNames, tree },
    totalKeywords,
    sheets,
    topCategories,
  }
}
