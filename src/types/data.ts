/**
 * Entity types for the v2 data model.
 *
 * Mirrors the SQLite schema in electron/database.ts. SQLite columns map
 * to TypeScript fields straightforwardly except:
 *   - INTEGER 0/1 -> boolean (converted at the service boundary)
 *   - TEXT JSON columns -> parsed objects (converted at the service boundary)
 *   - NULL columns -> `| null` in TypeScript (TypeScript-side queries
 *     never return undefined for nullable DB columns)
 *
 * Authoritative shape: docs/design/user-stories.md "Data model" section.
 */

// ---------------------------------------------------------------------------
// Documents (global Library)
// ---------------------------------------------------------------------------

export type DocumentStatus = 'pending' | 'extracting' | 'extracted' | 'failed'

export interface Document {
  id: string
  filename: string
  filePath: string
  fileHash: string
  fileSize: number | null
  title: string | null
  /** Nullable per US-X-06 — "Year unknown" is a real state, not 0000. */
  year: number | null
  company: string | null
  sector: string | null
  pageCount: number | null
  wordCount: number | null
  extractedText: string | null
  pdfMetadata: Record<string, unknown> | null
  status: DocumentStatus
  statusError: string | null
  importedAt: string
  extractedAt: string | null
}

// ---------------------------------------------------------------------------
// Lenses (Tag Axes)
// ---------------------------------------------------------------------------

export type LensType = 'keyword-attached' | 'document-context'

export interface Lens {
  id: string
  name: string
  description: string | null
  type: LensType
  isHierarchical: boolean
  isBuiltin: boolean
  createdAt: string
}

export interface LensValue {
  id: string
  lensId: string
  value: string
  displayName: string | null
  description: string | null
  parentValueId: string | null
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Keyword lists
// ---------------------------------------------------------------------------

export type KeywordListType = 'built-in' | 'custom'
export type KeywordPolarity = 'positive' | 'counter'

export interface KeywordList {
  id: string
  name: string
  description: string | null
  type: KeywordListType
  source: string | null
  parentListId: string | null
  createdAt: string
  updatedAt: string
}

export interface Keyword {
  id: string
  listId: string
  text: string
  polarity: KeywordPolarity
  enabled: boolean
  notes: string | null
  sortOrder: number
}

export interface KeywordTag {
  keywordId: string
  lensId: string
  valueId: string
}

export type SynonymSource = 'user' | 'ai-suggested-accepted'

export interface Synonym {
  id: string
  keywordId: string
  text: string
  enabled: boolean
  source: SynonymSource
  addedAt: string
}

export interface KeywordExclusion {
  id: string
  keywordId: string
  phrase: string
  addedAt: string
}

export interface SuppressedSpan {
  id: string
  keywordId: string
  documentId: string
  startOffset: number
  endOffset: number
  reason: string | null
  suppressedAt: string
}

// ---------------------------------------------------------------------------
// Scoring rules
// ---------------------------------------------------------------------------

export interface ScoringRuleLevel {
  value: number | string
  label: string
  description?: string
}

/**
 * Scoring-rule definition is intentionally opaque to TypeScript — it's a
 * JSON document the rule evaluator interprets. Different rule shapes
 * (count-functions-satisfying-pillars, weighted-match-sum, etc.) will
 * have different field sets. Validated at evaluation time, not at type
 * check time.
 */
export type ScoringRuleDefinition = Record<string, unknown>

export interface ScoringRule {
  id: string
  name: string
  description: string | null
  isBuiltin: boolean
  definition: ScoringRuleDefinition
  outputLevels: ScoringRuleLevel[]
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectFilterState = Record<string, unknown>

export interface Project {
  id: string
  name: string
  description: string | null
  researchFocus: string | null
  scoringRuleId: string | null
  filterState: ProjectFilterState | null
  createdAt: string
  updatedAt: string
}

/**
 * Project with its activated relationships joined in. Used by the Setup
 * tab and the project context strip.
 */
export interface ProjectWithSetup extends Project {
  documentIds: string[]
  keywordListIds: string[]
  lensIds: string[]
}
