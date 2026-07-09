/**
 * Pure Wedding Cake Score core — matrices in, score + Evaluation Trace out.
 *
 * No I/O: every input is already-resolved coverage data, so these functions
 * are unit-testable without the DbDriver. The Score Evaluator (services/
 * scoring.ts) fetches the matrices and calls these; Track and Compare reach
 * the same numbers through that evaluator, so the math lives in one place.
 *
 * Two shapes of the rule:
 *   - full     — count Function values delivering positive matches in EVERY
 *                required Pillar (uses the 2D Pillar × Function matrix).
 *   - v1       — count required Pillars mentioned positively (1D fallback,
 *                used until every document is Function-classified).
 */

import type { AxisValue } from '@/types/data'

export type TraceStatus = 'met' | 'unmet' | 'partial'

/** One step of the generic, renderable explanation of a score. */
export interface TraceStep {
  label: string
  status: TraceStatus
  detail: string
  /** Match count contributing to this step (for bar breakdowns / context). */
  count: number
  /**
   * Partial-credit ratio for this step, 0–1 (full mode: pillars-hit ÷
   * required for this function). Undefined for steps without a sub-ratio.
   */
  ratio?: number
  /** Pillars hit / required for this function (full mode) — for "2 / 3" display. */
  pillarsHit?: number
  pillarsRequired?: number
}

export interface DocScore {
  /** Coarse tier: functions delivering ALL required pillars (the X in X/4). */
  score: number
  max: number
  trace: TraceStep[]
  /**
   * Fine-grained pillar coverage summed across functions — the X in X/12.
   * Distinguishes "broad but shallow" (0/4 but 6/12) from "empty" (0/4, 0/12).
   * `overallRatio` = pillarsCovered / pillarsPossible (0–1). Present for both
   * full and v1 modes so they stay comparable on one 0–1 scale.
   */
  pillarsCovered?: number
  pillarsPossible?: number
  overallRatio?: number
}

/**
 * Full Wedding Cake: for each Function value, it "satisfies" when it has
 * positive matches in every required Pillar. Score = count of satisfying
 * functions.
 *
 * @param cells per-document 2D cells: cells[pillarValueId][functionValueId] = count
 */
export function weddingCakeFull(
  cells: Record<string, Record<string, number>>,
  requiredPillars: AxisValue[],
  functionValues: AxisValue[]
): DocScore {
  const required = requiredPillars.length
  const trace: TraceStep[] = functionValues.map((fn) => {
    const hits = requiredPillars.map((p) => cells[p.id]?.[fn.id] ?? 0)
    const pillarsHit = hits.filter((n) => n > 0).length
    const satisfies = required > 0 && pillarsHit === required
    // 'partial' credits a function that delivers some — but not all — required
    // pillars, so a broad-but-shallow document reads differently from an empty
    // one even when neither fully satisfies any function.
    const status: TraceStatus = satisfies ? 'met' : pillarsHit > 0 ? 'partial' : 'unmet'
    return {
      label: fn.displayName ?? fn.value,
      status,
      detail: satisfies
        ? 'Delivers all required pillars'
        : `${pillarsHit} of ${required} required pillars`,
      count: hits.reduce((a, n) => a + n, 0),
      ratio: required > 0 ? pillarsHit / required : 0,
      pillarsHit,
      pillarsRequired: required,
    }
  })
  const pillarsCovered = trace.reduce((a, s) => a + (s.pillarsHit ?? 0), 0)
  const pillarsPossible = functionValues.length * required
  return {
    score: trace.filter((s) => s.status === 'met').length,
    max: functionValues.length,
    trace,
    pillarsCovered,
    pillarsPossible,
    overallRatio: pillarsPossible > 0 ? pillarsCovered / pillarsPossible : 0,
  }
}

/**
 * v1 prerequisite: count required Pillars mentioned positively (regardless of
 * Function context). Score = count of pillars hit.
 *
 * @param lensTotals per-document 1D totals: lensTotals[pillarValueId] = count
 */
export function weddingCakeV1(
  lensTotals: Record<string, number>,
  requiredPillars: AxisValue[]
): DocScore {
  const trace: TraceStep[] = requiredPillars.map((p) => {
    const count = lensTotals[p.id] ?? 0
    return {
      label: p.displayName ?? p.value,
      status: count > 0 ? 'met' : 'unmet',
      detail: count > 0 ? 'Mentioned positively' : 'Not mentioned',
      count,
    }
  })
  const score = trace.filter((s) => s.status === 'met').length
  const max = requiredPillars.length
  return {
    score,
    max,
    trace,
    // v1 has no Function dimension; its "coverage" is simply pillars-hit /
    // required, so it stays on the same 0–1 scale as the full mode's X/12.
    pillarsCovered: score,
    pillarsPossible: max,
    overallRatio: max > 0 ? score / max : 0,
  }
}
