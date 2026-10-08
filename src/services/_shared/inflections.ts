/**
 * Deterministic single-word inflection detection — closes the documented
 * v1 gap in synonym discovery ("candidates come from corpus n-grams only
 * — doesn't include single words").
 *
 * Scope is deliberately narrow: GRAMMATICAL inflections only (plural,
 * verb forms — a closed suffix class). Derivational relatives
 * (sustainable, government) are excluded on purpose: they are a
 * meaning change, exactly the false-positive zone ADR-0037's prefix mode
 * leaves to the researcher. Suggesting "ecosystems" for keyword
 * "ecosystem" is evidence; suggesting "government" for "govern" would
 * be a bug wearing a helpful face.
 *
 * Pure functions — no backend, no model: this is rung 0 of the
 * ADR-0035 ladder and works offline.
 */

/** A corpus token with its frequency metadata. */
export interface TokenStat {
  count: number
  documentCount: number
}

export interface InflectionCandidate {
  text: string
  count: number
  documentCount: number
}

/**
 * Grammatical base forms of a word: itself plus every form produced by
 * stripping one inflectional suffix (with the standard orthographic
 * repairs: ies→y, ied→y, doubled final consonant).
 */
export function inflectionBases(word: string): Set<string> {
  const bases = new Set<string>([word])
  const add = (b: string): void => {
    // Floor 3: undoubled short verbs (run, plan) are real bases; anything
    // shorter is junk. isInflectionOf still requires both surface words ≥ 4.
    if (b.length >= 3) bases.add(b)
  }
  const undouble = (b: string): string => b.replace(/([^aeiouy])\1$/, '$1')

  if (word.endsWith('ies')) add(word.slice(0, -3) + 'y') // policies → policy
  if (word.endsWith('ied')) add(word.slice(0, -3) + 'y') // applied → apply
  if (word.endsWith('es')) add(word.slice(0, -2)) // matches → match
  if (word.endsWith('s')) add(word.slice(0, -1)) // ecosystems → ecosystem
  if (word.endsWith('ing')) {
    add(word.slice(0, -3)) // sustaining → sustain
    add(undouble(word.slice(0, -3))) // running → runn → run
  }
  if (word.endsWith('ed')) {
    add(word.slice(0, -1)) // sustained → sustain (verbs in -e)
    add(word.slice(0, -2)) // sustained → sustain (second path)
    add(undouble(word.slice(0, -2))) // planned → plann → plan
  }
  return bases
}

const WORD_RE = /^[a-z]{3,}$/

/**
 * True when `candidate` is a grammatical inflection of `keyword`
 * (same lemma, different form). Case-insensitive; both sides must be
 * plain alphabetic words of ≥ 3 letters; identity is not an inflection.
 */
export function isInflectionOf(candidate: string, keyword: string): boolean {
  const c = candidate.toLowerCase()
  const k = keyword.toLowerCase()
  if (c === k || !WORD_RE.test(c) || !WORD_RE.test(k)) return false
  for (const base of inflectionBases(c)) {
    if (inflectionBases(k).has(base)) return true
  }
  return false
}

/**
 * Corpus tokens that are inflections of `keyword`, excluding the keyword
 * itself, its already-accepted synonyms, and any other keyword on the
 * list. Sorted by corpus frequency, then alphabetically.
 */
export function findInflections(
  keyword: string,
  tokenStats: Map<string, TokenStat>,
  exclude: Iterable<string> = []
): InflectionCandidate[] {
  const excluded = new Set<string>()
  for (const e of exclude) excluded.add(e.toLowerCase())
  const out: InflectionCandidate[] = []
  for (const [token, stat] of tokenStats) {
    if (excluded.has(token)) continue
    if (!isInflectionOf(token, keyword)) continue
    out.push({ text: token, count: stat.count, documentCount: stat.documentCount })
  }
  out.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
  return out
}
