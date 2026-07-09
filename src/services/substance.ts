/**
 * Substance signals — deterministic "quality of commitment" measures.
 *
 * These answer questions raw match volume can't: is a document's language
 * broad or repetitive? Is its coverage genuine or boilerplate? A high match
 * count with few *unique* keywords, for instance, suggests the same few terms
 * reused — thin substance behind loud volume.
 *
 * Every function here is PURE and deterministic — the same inputs always give
 * the same output, so the signals are reproducible and can double as ranking
 * axes for the (planned) Focus / auto-research mode. See
 * docs/design/focus-auto-research-mode.md.
 *
 * Each signal is paired with a CONFIDENCE (0–1): a signal computed from a
 * short document with few matches is thin evidence and should be trusted less,
 * even when the raw ratio looks extreme. Callers surface confidence alongside
 * the value rather than hiding low-confidence rows.
 */

/** Per-document raw material the signals are derived from. */
export interface SubstanceInputs {
  /** Total keyword matches in the document (sum of countFor over keywords). */
  totalMatches: number
  /** Distinct keywords with ≥1 match. */
  uniqueKeywords: number
  /** Enabled keywords in the active list (the breadth denominator). */
  enabledKeywords: number
  /** Document length in words; null when unknown (no extracted text). */
  wordCount: number | null
}

// Evidence thresholds for full confidence. A document at or above BOTH is
// treated as fully trustworthy; below either, confidence tapers linearly.
// Deliberately modest — sustainability reports are long, but a keyword set may
// legitimately match only a few dozen times.
const WORDS_FOR_FULL_CONFIDENCE = 2000
const MATCHES_FOR_FULL_CONFIDENCE = 20

/**
 * Repetition: matches per unique keyword. 1.0 = every match is a different
 * keyword (maximally diverse); higher = the same terms repeated. Returns 0
 * when there are no matches (nothing to judge). This is the core
 * "loud-but-thin" signal.
 */
export function repetitionRatio(i: SubstanceInputs): number {
  if (i.uniqueKeywords <= 0) return 0
  return i.totalMatches / i.uniqueKeywords
}

/**
 * Diversity: fraction of the enabled keyword set the document touches at all
 * (unique ÷ enabled), 0–1. High = broad conceptual coverage; low = narrow.
 */
export function diversityRatio(i: SubstanceInputs): number {
  if (i.enabledKeywords <= 0) return 0
  return Math.min(1, i.uniqueKeywords / i.enabledKeywords)
}

/**
 * Intensity: matches per 1,000 words — match volume normalised for document
 * length, so a long report can't look more committed just by being long.
 * Null when word count is unknown or zero (can't normalise).
 */
export function intensityPer1k(i: SubstanceInputs): number | null {
  if (!i.wordCount || i.wordCount <= 0) return null
  return i.totalMatches / (i.wordCount / 1000)
}

/**
 * Confidence (0–1) in this document's signals, from evidence volume. A signal
 * derived from a short document with few matches is thin; both dimensions must
 * be adequate, so we take the weaker of the two (a 50,000-word report with 2
 * matches is still thin evidence). Deterministic, no randomness.
 */
export function substanceConfidence(i: SubstanceInputs): number {
  const wordConf = i.wordCount && i.wordCount > 0
    ? Math.min(1, i.wordCount / WORDS_FOR_FULL_CONFIDENCE)
    : 0
  const matchConf = Math.min(1, i.totalMatches / MATCHES_FOR_FULL_CONFIDENCE)
  return Math.min(wordConf, matchConf)
}

/**
 * Evidence reuse: the fraction of a document's matches that land on keywords
 * carrying MORE THAN ONE pillar tag — i.e. the same evidence counted toward
 * several pillars at once. High values flag "one project, many boxes ticked"
 * breadth that may be thinner than it looks. 0 when there are no matches (or
 * no keyword is multi-tagged). Pure; the caller supplies the two counts.
 */
export function evidenceReuseRatio(reuseMatches: number, totalMatches: number): number {
  if (totalMatches <= 0) return 0
  return reuseMatches / totalMatches
}

/** Coarse label for a 0–1 confidence, for compact display. */
export function confidenceLabel(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence < 0.34) return 'low'
  if (confidence < 0.67) return 'medium'
  return 'high'
}

/** All substance signals for one document, value + shared confidence. */
export interface SubstanceSignals {
  repetition: number
  diversity: number
  intensity: number | null
  confidence: number
}

export function computeSubstanceSignals(i: SubstanceInputs): SubstanceSignals {
  return {
    repetition: repetitionRatio(i),
    diversity: diversityRatio(i),
    intensity: intensityPer1k(i),
    confidence: substanceConfidence(i),
  }
}
