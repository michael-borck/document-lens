/**
 * Shared keyword matching for the analysis workflows (Coverage, Map, Track,
 * Compare, Read). Previously each service carried its own copy of this regex
 * logic; they're unified here so they can't drift and so synonym support is
 * added in one place.
 *
 * Matching rules:
 *   - case-insensitive
 *   - single-token keyword → whole-word match (\bword\b)
 *   - multi-token keyword (contains whitespace) → literal phrase match
 *   - regex metacharacters in the term are escaped
 *   - match_mode 'prefix' (ADR-0037) → word-start anchored extension
 *     (\bsustain\w*): "sustainability" matches "sustainable" but never
 *     "unsustainable". Multi-token prefix anchors the first token and
 *     extends the last ("clean energy" matches "clean energies").
 *     The mode belongs to the keyword's own text; synonyms always match
 *     exactly — they are already explicit researcher choices.
 *
 * Concept matching: a keyword plus its accepted synonyms is one "concept".
 * `findConceptSpans` matches every term and merges overlapping spans so a
 * single textual mention isn't double-counted — e.g. with keyword "energy"
 * and synonym "clean energy", the phrase "clean energy" counts once, not
 * twice.
 */

import type { KeywordMatchMode } from '@/types/data'

export interface MatchSpan {
  /** Char offset of the match start in the text. */
  start: number
  /** Char offset of the match end (exclusive). */
  end: number
  /** The exact substring that matched (preserves source casing). */
  matched: string
}

/**
 * Build the case-insensitive pattern for a term.
 * mode 'exact'  → whole-word / literal phrase (historical behaviour).
 * mode 'prefix' → word-start anchored, last token extensible (\w*).
 */
export function buildTermPattern(term: string, mode: KeywordMatchMode = 'exact'): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (mode === 'prefix') {
    const anchored = /^\w/.test(term) ? `\\b${escaped}` : escaped
    return new RegExp(`${anchored}\\w*`, 'gi')
  }
  return /\s/.test(term)
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')
}

/** Every match span for a single term. */
export function findTermSpans(
  text: string,
  term: string,
  mode: KeywordMatchMode = 'exact'
): MatchSpan[] {
  if (!text || !term) return []
  const pattern = buildTermPattern(term, mode)
  const spans: MatchSpan[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, matched: m[0] })
    if (m.index === pattern.lastIndex) pattern.lastIndex++ // zero-length guard
  }
  return spans
}

/**
 * Match a concept (keyword + accepted synonyms) and return its distinct
 * textual mentions. `keywordMode` (ADR-0037) applies to terms[0] — the
 * keyword itself; synonyms always match exactly. Overlapping spans
 * contributed by different terms are merged: spans are sorted by start
 * (longer first on a tie) and any span that overlaps an already-accepted
 * span is dropped, so each mention is counted once. Pass a single-element
 * `terms` array for a plain keyword.
 */
export function findConceptSpans(
  text: string,
  terms: string[],
  keywordMode: KeywordMatchMode = 'exact'
): MatchSpan[] {
  if (!text) return []
  const all: MatchSpan[] = []
  for (let i = 0; i < terms.length; i++) {
    all.push(...findTermSpans(text, terms[i], i === 0 ? keywordMode : 'exact'))
  }
  if (all.length <= 1) return all
  all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const accepted: MatchSpan[] = []
  let lastEnd = -1
  for (const span of all) {
    if (span.start >= lastEnd) {
      accepted.push(span)
      lastEnd = span.end
    }
  }
  return accepted
}

/** Count distinct mentions of a concept (keyword + synonyms) in the text. */
export function countConcept(
  text: string,
  terms: string[],
  keywordMode: KeywordMatchMode = 'exact'
): number {
  return findConceptSpans(text, terms, keywordMode).length
}

/**
 * Boundaries of the sentence containing a span (runs between
 * sentence-ending punctuation or newlines). `end` is exclusive and stops
 * BEFORE the terminating punctuation character, matching the historical
 * exclusion-window behaviour. Also the passage-grouping unit for the
 * per-mention export: spans sharing a sentence share these bounds.
 */
export function sentenceWindowBounds(
  text: string,
  spanStart: number,
  spanEnd: number
): { start: number; end: number } {
  let lo = spanStart
  while (lo > 0 && !/[.!?\n]/.test(text[lo - 1])) lo--
  let hi = spanEnd
  while (hi < text.length && !/[.!?\n]/.test(text[hi])) hi++
  return { start: lo, end: hi }
}

/**
 * Extract the sentence containing a span. Used by applyExclusions to scope
 * the veto check.
 */
function getSentenceWindow(text: string, spanStart: number, spanEnd: number): string {
  const { start, end } = sentenceWindowBounds(text, spanStart, spanEnd)
  return text.slice(start, end)
}

/**
 * Filter spans by exclusion phrases. If any exclusion phrase appears
 * (case-insensitively) in the same sentence as a span, that span is
 * suppressed. Returns the surviving spans.
 */
export function applyExclusions(
  text: string,
  spans: MatchSpan[],
  exclusionPhrases: string[]
): MatchSpan[] {
  if (exclusionPhrases.length === 0) return spans
  const patterns = exclusionPhrases.map(
    (p) => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  )
  return spans.filter((span) => {
    const window = getSentenceWindow(text, span.start, span.end)
    return !patterns.some((p) => p.test(window))
  })
}
