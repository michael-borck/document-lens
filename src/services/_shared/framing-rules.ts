/**
 * Deterministic framing detection — rung 0 of ADR-0039's ladder.
 *
 * Implements the v9 legend's arrow test, partially and on purpose:
 * only the two framings a regex can settle with HIGH precision are
 * detected —
 *
 *   - **2 Quantified**: a direction of value + a number + a date anchor
 *     ("net zero by 2035", "reduce emissions 35 per cent by 2030").
 *   - **3 Limit**: a decision subordinated to an environmental boundary
 *     ("operate within", "not exceed") — beats Quantified when both fire.
 *
 * **1 Aspirational** and **0 Silent** are never suggested: a direction
 * without a number is a semantic judgement (the ClimateBERT run's job),
 * and Silent is the absence of a signal — suggesting it from rules would
 * be noise wearing a rule badge.
 *
 * Precision over recall, always: these become flagged suggestions a
 * researcher confirms or dismisses (dismissals kept), never recorded
 * codes. Pure functions — no backend, no model, works offline.
 */

export type FramingValue = '0' | '1' | '2' | '3'

export interface FramingHit {
  value: FramingValue
  /** Stable rule id — the suggestion's provenance (suggested_by / rule). */
  rule: string
  /** Offset of the triggering match within the passage. */
  matchStart: number
  matchEnd: number
}

// Direction of value — the "arrow" in the legend's arrow test.
const DIRECTION_RE =
  /\b(net[- ]?zero|carbon[- ]?neutral|climate[- ]?neutral|reduce[sd]?|reduction|reductions|cut[s]?|decrease|lower[sd]?|target[s]?|commit(?:ted|ment|ments)?|pledge[ds]?|goal[s]?|aim[s]?|increase[sd]?)\b/gi

// A quantity — digits with an optional unit word (per cent, %, tonnes…).
const NUMBER_RE = /\b\d+(?:[.,]\d+)?\s*(?:%|per\s?cent|percent|million|billion|tonnes|gigawatt(?:-?)?hours|gigalitres|hectares|kilometres)?\b/gi

// A date anchor — the "by 2035" half of the legend's example.
const DATE_ANCHOR_RE = /\b(?:by|before|within|until|by\s+the\s+end\s+of)\s+(?:19|20)\d{2}\b/gi

// Environmental boundary that binds a decision — the legend's own phrases
// plus the tightest near-synonyms. Deliberately short: precision first.
const LIMIT_RE =
  /\b(?:operate|operating|operates|stay[s]?|remaining?|remain|live[s]?)\s+within\b|\bnot\s+exceed(?:ing|s)?\b|\bno\s+more\s+than\b|\bcapped?\s+(?:at|to)\b|\bwithin\s+(?:the\s+)?planetary\s+(?:boundaries|budget)\b|\bsubordinated\s+to\b/gi

function spansOf(re: RegExp, text: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) {
    if (m[0].length === 0) {
      rx.lastIndex++
      continue
    }
    out.push({ start: m.index, end: m.index + m[0].length })
  }
  return out
}

/**
 * Detect the framings a deterministic rule can settle, for one passage.
 * Returns at most one hit: Limit beats Quantified (a boundary that binds
 * is the stronger claim per the legend), Quantified needs all three
 * ingredients (direction + number + date anchor) anywhere in the passage
 * — the legend's examples ("net zero by 2035", "35 per cent reduction by
 * 2030") read as direction + number + date in one sentence.
 */
export function detectFraming(passage: string): FramingHit | null {
  const limits = spansOf(LIMIT_RE, passage)
  if (limits.length > 0) {
    return { value: '3', rule: 'limit-boundary', matchStart: limits[0].start, matchEnd: limits[0].end }
  }

  const directions = spansOf(DIRECTION_RE, passage)
  const numbers = spansOf(NUMBER_RE, passage)
  const dates = spansOf(DATE_ANCHOR_RE, passage)
  if (directions.length > 0 && numbers.length > 0 && dates.length > 0) {
    return {
      value: '2',
      rule: 'quantified-number-date',
      matchStart: dates[0].start,
      matchEnd: dates[0].end,
    }
  }
  return null
}
