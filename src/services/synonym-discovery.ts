/**
 * Synonym discovery — orchestrates n-gram extraction and embedding-
 * similarity ranking to suggest synonym candidates per keyword.
 *
 * Pipeline:
 *   1. Extract candidate corpus terms via computeNgrams (uses the
 *      project's documents). Bigrams + trigrams above a low frequency
 *      threshold to keep the candidate set meaningful.
 *   2. Send keyword texts as `source_terms` and candidate phrases as
 *      `candidate_terms` to /semantic/similar-terms (document-analyser
 *      ≥ 0.2.3). Backend returns top-N candidates per source by cosine
 *      similarity.
 *   3. Filter out candidates already in each keyword's synonym list so
 *      the user doesn't see what they've already accepted.
 *
 * Returns one entry per keyword with its ranked candidate list. Caller
 * (the Discover Synonyms sub-tab) renders the per-keyword cards and
 * wires Accept (-> createSynonym) / Reject (skip) actions.
 *
 * v1 limitations: candidates come from corpus n-grams only — doesn't
 * include single words (frequent single tokens are mostly stopwords or
 * already-keyword tokens). Doesn't query keywords per polarity in a
 * single pass — the caller picks one polarity at a time.
 */

import { computeNgrams } from './ngrams'
import { listKeywords, listExistingSynonymsForKeywords } from './keyword-lists'
import { api, type SimilarTermsResponse } from './api'
import type { Keyword, KeywordPolarity } from '@/types/data'

export interface SynonymCandidate {
  /** The candidate phrase from the corpus. */
  text: string
  /** Cosine similarity to the parent keyword (0-1). */
  similarity: number
  /** How many times the candidate appears in the corpus. */
  count: number
  /** How many of the project's documents contain it. */
  documentCount: number
}

export interface KeywordSynonymCandidates {
  keyword: Keyword
  candidates: SynonymCandidate[]
}

export interface DiscoverSynonymsResult {
  /** Per-keyword candidate lists, keywords in input order. */
  perKeyword: KeywordSynonymCandidates[]
  /** Total candidate phrases considered (the n-gram set size). */
  candidatePoolSize: number
  /** True if the backend returned 503 (model unavailable). */
  unavailable: boolean
}

export interface DiscoverSynonymsInput {
  projectId: string
  keywordListId: string
  /** Filter keywords to this polarity. */
  polarity: KeywordPolarity
  /** Min cosine similarity for the candidate to surface (0-1). Default 0.4. */
  minSimilarity?: number
  /** Top-N candidates per keyword. Default 8. */
  topN?: number
  /** Min corpus frequency for an n-gram to enter the candidate pool. Default 3. */
  minNgramFrequency?: number
}

export interface DiscoverSynonymsProgress {
  phase: 'extracting-ngrams' | 'ranking' | 'merging'
  message: string
}

export async function discoverSynonyms(
  input: DiscoverSynonymsInput,
  onProgress?: (p: DiscoverSynonymsProgress) => void
): Promise<DiscoverSynonymsResult> {
  // 1. Resolve keywords for this polarity.
  const allKeywords = await listKeywords(input.keywordListId)
  const keywords = allKeywords.filter((k) => k.enabled && k.polarity === input.polarity)
  if (keywords.length === 0) {
    return { perKeyword: [], candidatePoolSize: 0, unavailable: false }
  }

  // 2. Extract corpus n-grams as candidate pool.
  onProgress?.({ phase: 'extracting-ngrams', message: 'Extracting corpus phrases…' })
  const ngramResult = await computeNgrams({
    projectId: input.projectId,
    sizes: [2, 3],
    minCount: input.minNgramFrequency ?? 3,
    topN: 500,  // ample candidate pool
  })

  if (ngramResult.results.length === 0) {
    return { perKeyword: [], candidatePoolSize: 0, unavailable: false }
  }

  // 3. Index candidates by phrase for quick metadata lookup post-ranking.
  const candidateMeta = new Map<string, { count: number; documentCount: number }>()
  for (const r of ngramResult.results) {
    candidateMeta.set(r.phrase.toLowerCase(), { count: r.count, documentCount: r.documentCount })
  }

  // 4. Pull existing synonyms so we don't suggest already-accepted ones.
  const existing = await listExistingSynonymsForKeywords(keywords.map((k) => k.id))

  // 5. Rank: send keyword texts + candidate phrases to backend.
  onProgress?.({
    phase: 'ranking',
    message: `Ranking ${ngramResult.results.length} candidate phrases against ${keywords.length} keyword${keywords.length === 1 ? '' : 's'}…`,
  })
  let response: SimilarTermsResponse
  try {
    response = await api.findSimilarTerms(
      keywords.map((k) => k.text),
      ngramResult.results.map((r) => r.phrase),
      {
        topN: input.topN ?? 8,
        minSimilarity: input.minSimilarity ?? 0.4,
      }
    )
  } catch (err) {
    // Treat 503 / unavailable embedding model gracefully.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Embedding model unavailable') || msg.includes('503')) {
      return { perKeyword: [], candidatePoolSize: ngramResult.results.length, unavailable: true }
    }
    throw err
  }

  // 6. Merge: response is keyword-text -> ranked candidates. Filter
  //    already-accepted, attach corpus metadata.
  onProgress?.({ phase: 'merging', message: 'Filtering already-accepted suggestions…' })
  const perKeyword: KeywordSynonymCandidates[] = []
  for (const keyword of keywords) {
    const responseEntry = response.results.find((r) => r.source === keyword.text)
    if (!responseEntry) {
      perKeyword.push({ keyword, candidates: [] })
      continue
    }
    const existingForKw = existing.get(keyword.id) ?? new Set<string>()
    const candidates: SynonymCandidate[] = []
    for (const c of responseEntry.candidates) {
      const lower = c.candidate.toLowerCase()
      if (existingForKw.has(lower)) continue              // already accepted
      if (lower === keyword.text.toLowerCase()) continue  // self
      const meta = candidateMeta.get(lower) ?? { count: 0, documentCount: 0 }
      candidates.push({
        text: c.candidate,
        similarity: c.similarity,
        count: meta.count,
        documentCount: meta.documentCount,
      })
    }
    perKeyword.push({ keyword, candidates })
  }

  return {
    perKeyword,
    candidatePoolSize: ngramResult.results.length,
    unavailable: false,
  }
}
