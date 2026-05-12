/**
 * Concordance: surface every occurrence of a keyword in a document
 * with surrounding context, so the user can quote, cite, or fact-check.
 *
 * Local-only. Uses the extracted_text already in the documents table
 * from import.
 */

import { getDocument } from './documents'
import type { KeywordPolarity } from '@/types/data'

export interface ConcordanceMatch {
  /** 0-based occurrence index across the document. */
  index: number
  /** Character offset of the match start in the document's extracted_text. */
  position: number
  /** The exact text that matched (preserves source casing). */
  matched: string
  /** Words before the match, capped at contextWords. */
  before: string
  /** Words after the match, capped at contextWords. */
  after: string
}

export interface ConcordanceResult {
  documentId: string
  keyword: string
  contextWords: number
  matches: ConcordanceMatch[]
  /** True when the document has no extracted_text yet. */
  unavailable: boolean
}

export interface FindConcordanceInput {
  documentId: string
  keyword: string
  /** N words to include on each side. */
  contextWords: number
}

export async function findConcordance(input: FindConcordanceInput): Promise<ConcordanceResult> {
  const doc = await getDocument(input.documentId)
  if (!doc) {
    throw new Error(`Document ${input.documentId} not found`)
  }

  const text = doc.extractedText ?? ''
  if (text.length === 0) {
    return {
      documentId: input.documentId,
      keyword: input.keyword,
      contextWords: input.contextWords,
      matches: [],
      unavailable: true,
    }
  }

  const matches = findAllMatches(text, input.keyword, input.contextWords)
  return {
    documentId: input.documentId,
    keyword: input.keyword,
    contextWords: input.contextWords,
    matches,
    unavailable: false,
  }
}

function findAllMatches(text: string, keyword: string, contextWords: number): ConcordanceMatch[] {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = /\s/.test(keyword)
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')

  const out: ConcordanceMatch[] = []
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length

    const beforeText = text.slice(0, start)
    const afterText = text.slice(end)

    const before = lastNWords(beforeText, contextWords)
    const after = firstNWords(afterText, contextWords)

    out.push({
      index: i,
      position: start,
      matched: match[0],
      before,
      after,
    })
    i++

    // Guard against zero-length matches (shouldn't happen with our patterns)
    if (match.index === pattern.lastIndex) pattern.lastIndex++
  }

  return out
}

function lastNWords(text: string, n: number): string {
  if (n <= 0) return ''
  // Split on whitespace runs. Keep filtering empty strings so leading
  // whitespace doesn't inflate the count.
  const words = text.split(/\s+/).filter(Boolean)
  return words.slice(-n).join(' ')
}

function firstNWords(text: string, n: number): string {
  if (n <= 0) return ''
  const words = text.split(/\s+/).filter(Boolean)
  return words.slice(0, n).join(' ')
}

/**
 * Convenience for callers that want to filter the keyword pool by
 * polarity before showing the picker. Returns keywords from a list
 * sorted by polarity then sort_order then text.
 */
export interface KeywordOption {
  id: string
  text: string
  polarity: KeywordPolarity
  enabled: boolean
}
