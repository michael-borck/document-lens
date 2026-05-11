/**
 * N-gram Analysis Service
 * 
 * Handles n-gram extraction, aggregation across documents, and caching results.
 */

import { api } from './api'
import type { DocumentRecord } from './documents'

export interface NgramResult {
  phrase: string
  count: number
  frequency?: number
}

export interface DocumentNgramResult {
  documentId: string
  documentName: string
  companyName: string | null
  reportYear: number | null
  ngrams: NgramResult[]
}

export interface AggregatedNgramResult {
  phrase: string
  totalCount: number
  documentCount: number
  byDocument: Array<{
    documentId: string
    documentName: string
    count: number
  }>
}

export interface NgramAnalysisResult {
  ngramType: number // 2 for bigrams, 3 for trigrams
  filterTerms: string[] | null
  topK: number
  documents: DocumentNgramResult[]
  aggregated: AggregatedNgramResult[]
  summary: {
    totalDocuments: number
    totalNgrams: number
    uniqueNgrams: number
  }
}

export interface NgramProgress {
  total: number
  current: number
  currentDocument: string
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  error?: string
}

/**
 * Analyze n-grams for a single document (local fallback)
 */
function extractNgramsLocal(
  text: string,
  n: number,
  topK: number = 100,
  filterTerms?: string[]
): NgramResult[] {
  // Tokenize text into words (simple approach)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)

  // Generate n-grams
  const ngramCounts: Record<string, number> = {}
  
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(' ')
    
    // If filter terms provided, check if ngram contains any of them
    if (filterTerms && filterTerms.length > 0) {
      const lowerNgram = ngram.toLowerCase()
      const hasFilterTerm = filterTerms.some(term => 
        lowerNgram.includes(term.toLowerCase())
      )
      if (!hasFilterTerm) continue
    }
    
    ngramCounts[ngram] = (ngramCounts[ngram] || 0) + 1
  }

  // Sort by count and take top K
  const sorted = Object.entries(ngramCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([phrase, count]) => ({ phrase, count }))

  return sorted
}

/**
 * Analyze n-grams for a single document using API
 */
async function analyzeDocumentNgrams(
  document: DocumentRecord,
  ngramType: number,
  topK: number,
  filterTerms?: string[]
): Promise<DocumentNgramResult> {
  if (!document.extracted_text) {
    return {
      documentId: document.id,
      documentName: document.filename,
      companyName: document.company_name,
      reportYear: document.report_year,
      ngrams: [],
    }
  }

  let ngrams: NgramResult[]

  try {
    // Try API first
    const response = await api.analyzeNgrams(
      document.extracted_text,
      ngramType,
      topK,
      filterTerms
    )
    ngrams = response.top_ngrams
  } catch (error) {
    // Fallback to local extraction
    console.warn('API n-gram analysis failed, using local extraction:', error)
    ngrams = extractNgramsLocal(
      document.extracted_text,
      ngramType,
      topK,
      filterTerms
    )
  }

  return {
    documentId: document.id,
    documentName: document.filename,
    companyName: document.company_name,
    reportYear: document.report_year,
    ngrams,
  }
}

/**
 * Aggregate n-grams across multiple documents
 */
function aggregateNgrams(
  documentResults: DocumentNgramResult[],
  topK: number = 100
): AggregatedNgramResult[] {
  const aggregated: Record<string, AggregatedNgramResult> = {}

  for (const docResult of documentResults) {
    for (const ngram of docResult.ngrams) {
      if (!aggregated[ngram.phrase]) {
        aggregated[ngram.phrase] = {
          phrase: ngram.phrase,
          totalCount: 0,
          documentCount: 0,
          byDocument: [],
        }
      }

      aggregated[ngram.phrase].totalCount += ngram.count
      aggregated[ngram.phrase].documentCount += 1
      aggregated[ngram.phrase].byDocument.push({
        documentId: docResult.documentId,
        documentName: docResult.documentName,
        count: ngram.count,
      })
    }
  }

  // Sort by total count and return top K
  return Object.values(aggregated)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, topK)
}

/**
 * Analyze n-grams across multiple documents
 */
export async function analyzeNgrams(
  documents: DocumentRecord[],
  ngramType: number = 2,
  topK: number = 100,
  filterTerms?: string[],
  onProgress?: (progress: NgramProgress) => void
): Promise<NgramAnalysisResult> {
  const documentResults: DocumentNgramResult[] = []

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]

    onProgress?.({
      total: documents.length,
      current: i + 1,
      currentDocument: doc.filename,
      status: 'analyzing',
    })

    try {
      const result = await analyzeDocumentNgrams(doc, ngramType, topK, filterTerms)
      documentResults.push(result)
    } catch (error) {
      console.error(`Failed to analyze n-grams for ${doc.filename}:`, error)
      // Add empty result for failed document
      documentResults.push({
        documentId: doc.id,
        documentName: doc.filename,
        companyName: doc.company_name,
        reportYear: doc.report_year,
        ngrams: [],
      })
    }
  }

  // Aggregate results
  const aggregated = aggregateNgrams(documentResults, topK)

  // Calculate summary
  const allNgrams = documentResults.flatMap(d => d.ngrams)
  const uniqueNgrams = new Set(allNgrams.map(n => n.phrase))

  onProgress?.({
    total: documents.length,
    current: documents.length,
    currentDocument: '',
    status: 'completed',
  })

  return {
    ngramType,
    filterTerms: filterTerms || null,
    topK,
    documents: documentResults,
    aggregated,
    summary: {
      totalDocuments: documents.length,
      totalNgrams: allNgrams.reduce((sum, n) => sum + n.count, 0),
      uniqueNgrams: uniqueNgrams.size,
    },
  }
}

/**
 * Get context snippets for a specific n-gram phrase in a document
 */
export function getNgramContexts(
  text: string,
  phrase: string,
  contextChars: number = 100,
  maxContexts: number = 10
): string[] {
  const contexts: string[] = []
  const lowerText = text.toLowerCase()
  const lowerPhrase = phrase.toLowerCase()
  
  let position = 0
  while (contexts.length < maxContexts) {
    const index = lowerText.indexOf(lowerPhrase, position)
    if (index === -1) break

    const start = Math.max(0, index - contextChars)
    const end = Math.min(text.length, index + phrase.length + contextChars)
    
    let context = text.substring(start, end)
    if (start > 0) context = '...' + context
    if (end < text.length) context = context + '...'
    
    contexts.push(context)
    position = index + 1
  }

  return contexts
}
