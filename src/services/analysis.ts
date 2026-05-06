/**
 * Analysis Service
 * 
 * Handles document analysis, keyword search, and batch operations.
 */

import { v4 as uuidv4 } from 'uuid'
import { api } from './api'
import type { DocumentRecord } from './documents'
import {
  type HierarchicalKeywords,
  flattenHierarchy,
  aggregateAtTier,
} from './keywords'

export interface AnalysisProgress {
  total: number
  current: number
  currentDocument: string
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  error?: string
}

export interface AnalysisResult {
  id: string
  document_id: string
  analysis_type: string
  results: string // JSON string
  created_at: string
}

export interface KeywordMatch {
  keyword: string
  count: number
  contexts: Array<{
    text: string
    position: number
  }>
}

export interface KeywordSearchResult {
  documentId: string
  documentName: string
  companyName: string | null
  reportYear: number | null
  matches: Record<string, KeywordMatch>
  totalMatches: number
}

export interface BatchKeywordSearchResult {
  keywords: string[]
  documents: KeywordSearchResult[]
  summary: {
    totalDocuments: number
    totalMatches: number
    keywordCounts: Record<string, number>
  }
}

/**
 * Analyze a single document
 * Uses the /text endpoint which returns all analysis in one call
 */
export async function analyzeDocument(
  document: DocumentRecord,
  onProgress?: (status: string) => void
): Promise<void> {
  if (!document.extracted_text) {
    throw new Error('Document has no extracted text')
  }

  try {
    // Update status to analyzing
    await window.electron.dbRun(
      "UPDATE documents SET analysis_status = 'analyzing' WHERE id = ?",
      [document.id]
    )

    onProgress?.('Analyzing document...')
    
    // Single API call gets all analysis data
    const result = await api.analyzeText(document.extracted_text)
    
    // Save all analysis results from the unified response
    await saveAnalysisResult(document.id, 'text_metrics', result.analysis.text_metrics)
    await saveAnalysisResult(document.id, 'readability', result.analysis.readability)
    await saveAnalysisResult(document.id, 'writing_quality', result.analysis.writing_quality)
    await saveAnalysisResult(document.id, 'word_analysis', result.analysis.word_analysis)
    
    if (result.analysis.ner) {
      await saveAnalysisResult(document.id, 'ner', result.analysis.ner)
    }

    // Update status to completed
    await window.electron.dbRun(
      "UPDATE documents SET analysis_status = 'completed', analyzed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [document.id]
    )
  } catch (error) {
    // Update status to failed
    await window.electron.dbRun(
      "UPDATE documents SET analysis_status = 'failed' WHERE id = ?",
      [document.id]
    )
    throw error
  }
}

/**
 * Save analysis result to database
 */
async function saveAnalysisResult(
  documentId: string,
  analysisType: string,
  results: unknown
): Promise<void> {
  const id = uuidv4()
  
  // Delete existing result of same type
  await window.electron.dbRun(
    'DELETE FROM analysis_results WHERE document_id = ? AND analysis_type = ?',
    [documentId, analysisType]
  )
  
  // Insert new result
  await window.electron.dbRun(
    'INSERT INTO analysis_results (id, document_id, analysis_type, results) VALUES (?, ?, ?, ?)',
    [id, documentId, analysisType, JSON.stringify(results)]
  )
}

/**
 * Analyze multiple documents with progress tracking
 */
export async function analyzeDocuments(
  documents: DocumentRecord[],
  onProgress?: (progress: AnalysisProgress) => void
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    
    onProgress?.({
      total: documents.length,
      current: i + 1,
      currentDocument: doc.filename,
      status: 'analyzing',
    })

    try {
      await analyzeDocument(doc, (status) => {
        onProgress?.({
          total: documents.length,
          current: i + 1,
          currentDocument: doc.filename,
          status: 'analyzing',
        })
      })
      success++
    } catch (error) {
      console.error(`Failed to analyze ${doc.filename}:`, error)
      failed++
    }
  }

  onProgress?.({
    total: documents.length,
    current: documents.length,
    currentDocument: '',
    status: 'completed',
  })

  return { success, failed }
}

/**
 * Search for a single keyword in a document's text
 */
function searchKeywordInText(
  text: string,
  keyword: string,
  contextChars: number = 100
): KeywordMatch {
  const matches: Array<{ text: string; position: number }> = []
  const lowerText = text.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()
  
  let position = 0
  while (true) {
    const index = lowerText.indexOf(lowerKeyword, position)
    if (index === -1) break
    
    // Extract context around the match
    const start = Math.max(0, index - contextChars)
    const end = Math.min(text.length, index + keyword.length + contextChars)
    let context = text.substring(start, end)
    
    // Add ellipsis if truncated
    if (start > 0) context = '...' + context
    if (end < text.length) context = context + '...'
    
    matches.push({
      text: context,
      position: index,
    })
    
    position = index + 1
  }

  return {
    keyword,
    count: matches.length,
    contexts: matches.slice(0, 10), // Limit to 10 contexts per keyword
  }
}

/**
 * Search for multiple keywords across multiple documents (local implementation)
 */
export async function searchKeywordsLocal(
  documents: DocumentRecord[],
  keywords: string[],
  contextChars: number = 100
): Promise<BatchKeywordSearchResult> {
  const results: KeywordSearchResult[] = []
  const keywordCounts: Record<string, number> = {}
  let totalMatches = 0

  // Initialize keyword counts
  keywords.forEach(k => { keywordCounts[k] = 0 })

  for (const doc of documents) {
    if (!doc.extracted_text) continue

    const matches: Record<string, KeywordMatch> = {}
    let docTotalMatches = 0

    for (const keyword of keywords) {
      const match = searchKeywordInText(doc.extracted_text, keyword, contextChars)
      if (match.count > 0) {
        matches[keyword] = match
        docTotalMatches += match.count
        keywordCounts[keyword] += match.count
        totalMatches += match.count
      }
    }

    results.push({
      documentId: doc.id,
      documentName: doc.filename,
      companyName: doc.company_name,
      reportYear: doc.report_year,
      matches,
      totalMatches: docTotalMatches,
    })
  }

  // Sort by total matches descending
  results.sort((a, b) => b.totalMatches - a.totalMatches)

  return {
    keywords,
    documents: results,
    summary: {
      totalDocuments: documents.length,
      totalMatches,
      keywordCounts,
    },
  }
}

/**
 * Get analysis results for a document
 */
export async function getDocumentAnalysis(
  documentId: string
): Promise<Record<string, unknown>> {
  const results = await window.electron.dbQuery<AnalysisResult>(
    'SELECT * FROM analysis_results WHERE document_id = ?',
    [documentId]
  )

  const analysis: Record<string, unknown> = {}
  for (const result of results) {
    try {
      analysis[result.analysis_type] = JSON.parse(result.results)
    } catch {
      analysis[result.analysis_type] = result.results
    }
  }

  return analysis
}


/**
 * Tier-level aggregation for a single category
 */
export interface TierCategoryAggregation {
  matchCount: number       // total keyword matches in this category
  keywordCount: number     // how many unique keywords matched
  totalKeywords: number    // how many keywords exist in this category
  coverage: number         // keywordCount / totalKeywords
}

/**
 * Aggregation at a single tier level across all documents
 */
export type TierAggregation = Record<string, TierCategoryAggregation>

/**
 * Per-document tier aggregation
 */
export interface DocumentTierAggregation {
  documentId: string
  documentName: string
  companyName: string | null
  reportYear: number | null
  tiers: Record<string, TierAggregation>  // tierName → category aggregations
}

/**
 * Complete hierarchical search result
 */
export interface HierarchicalSearchResult {
  baseResults: BatchKeywordSearchResult
  hierarchy: HierarchicalKeywords
  /** Aggregation across all documents, per tier */
  overallTiers: Record<string, TierAggregation>
  /** Per-document tier aggregations */
  documentTiers: DocumentTierAggregation[]
}

/**
 * Build tier-level aggregations from flat keyword search results and a hierarchy.
 * This is a pure post-processing step — no additional searching needed.
 */
export function buildHierarchicalAggregations(
  baseResults: BatchKeywordSearchResult,
  hierarchy: HierarchicalKeywords
): HierarchicalSearchResult {
  const { tiers, tree } = hierarchy

  // Build overall tier aggregations (across all documents)
  const overallTiers: Record<string, TierAggregation> = {}
  for (let depth = 0; depth < tiers.length; depth++) {
    const tierName = tiers[depth]
    const categoryKeywords = aggregateAtTier(tree, depth)
    const agg: TierAggregation = {}

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      const totalKeywords = keywords.length
      let matchCount = 0
      let keywordCount = 0

      for (const kw of keywords) {
        const count = baseResults.summary.keywordCounts[kw] || 0
        if (count > 0) {
          matchCount += count
          keywordCount++
        }
      }

      agg[category] = {
        matchCount,
        keywordCount,
        totalKeywords,
        coverage: totalKeywords > 0 ? keywordCount / totalKeywords : 0,
      }
    }

    overallTiers[tierName] = agg
  }

  // Build per-document tier aggregations
  const documentTiers: DocumentTierAggregation[] = baseResults.documents.map(doc => {
    const docTiers: Record<string, TierAggregation> = {}

    for (let depth = 0; depth < tiers.length; depth++) {
      const tierName = tiers[depth]
      const categoryKeywords = aggregateAtTier(tree, depth)
      const agg: TierAggregation = {}

      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        const totalKeywords = keywords.length
        let matchCount = 0
        let keywordCount = 0

        for (const kw of keywords) {
          const match = doc.matches[kw]
          if (match && match.count > 0) {
            matchCount += match.count
            keywordCount++
          }
        }

        agg[category] = {
          matchCount,
          keywordCount,
          totalKeywords,
          coverage: totalKeywords > 0 ? keywordCount / totalKeywords : 0,
        }
      }

      docTiers[tierName] = agg
    }

    return {
      documentId: doc.documentId,
      documentName: doc.documentName,
      companyName: doc.companyName,
      reportYear: doc.reportYear,
      tiers: docTiers,
    }
  })

  return {
    baseResults,
    hierarchy,
    overallTiers,
    documentTiers,
  }
}
