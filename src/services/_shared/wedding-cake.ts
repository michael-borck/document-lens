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

import type { LensValue } from '@/types/data'

export type TraceStatus = 'met' | 'unmet' | 'partial'

/** One step of the generic, renderable explanation of a score. */
export interface TraceStep {
  label: string
  status: TraceStatus
  detail: string
  /** Match count contributing to this step (for bar breakdowns / context). */
  count: number
}

export interface DocScore {
  score: number
  max: number
  trace: TraceStep[]
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
  requiredPillars: LensValue[],
  functionValues: LensValue[]
): DocScore {
  const trace: TraceStep[] = functionValues.map((fn) => {
    const hits = requiredPillars.map((p) => cells[p.id]?.[fn.id] ?? 0)
    const satisfies = hits.every((n) => n > 0)
    const missing = hits.filter((n) => n === 0).length
    return {
      label: fn.displayName ?? fn.value,
      status: satisfies ? 'met' : 'unmet',
      detail: satisfies
        ? 'Delivers all required pillars'
        : `Missing ${missing} of ${requiredPillars.length} required pillars`,
      count: hits.reduce((a, n) => a + n, 0),
    }
  })
  return {
    score: trace.filter((s) => s.status === 'met').length,
    max: functionValues.length,
    trace,
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
  requiredPillars: LensValue[]
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
  return {
    score: trace.filter((s) => s.status === 'met').length,
    max: requiredPillars.length,
    trace,
  }
}
