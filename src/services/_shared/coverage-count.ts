/**
 * Coverage Count scoring core — flat, single-axis pattern.
 *
 * Score = how many of the category lens values have at least one positive
 * keyword match in the document. Max = total number of category values.
 *
 * Used when a researcher wants "how many of my N categories does this
 * document cover?" (Triple Bottom Line with N=3, Balanced Scorecard with
 * N=4, NIST CSF with N=5, etc.).
 */

import type { AxisValue } from '@/types/data'
import type { DocScore, TraceStep } from './wedding-cake'

export { DocScore, TraceStep }

/**
 * @param lensTotals per-document 1D totals: lensTotals[categoryValueId] = count
 * @param categoryValues all values of the category lens
 */
export function coverageCount(
  lensTotals: Record<string, number>,
  categoryValues: AxisValue[]
): DocScore {
  const trace: TraceStep[] = categoryValues.map((v) => {
    const count = lensTotals[v.id] ?? 0
    return {
      label: v.displayName ?? v.value,
      status: count > 0 ? 'met' : 'unmet',
      detail: count > 0 ? 'Covered' : 'Not covered',
      count,
    }
  })
  return {
    score: trace.filter((s) => s.status === 'met').length,
    max: categoryValues.length,
    trace,
  }
}
