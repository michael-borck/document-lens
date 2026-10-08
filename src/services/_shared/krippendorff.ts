/**
 * Krippendorff's α — the inter-coder-reliability statistic the
 * calibration protocol pins (`research-context/calibration-protocol.md`).
 *
 * Coincidence-pair formulation (Krippendorff 2011, "Computing
 * Krippendorff's Alpha-Reliability"): units contribute all pairs of
 * their coders' values, weighted 1/(m−1); missing coders simply shrink
 * the unit — never imputed (protocol rule).
 *
 * Two metrics the protocol names:
 *   - nominal  — Relevance, Domain, Prominence, Type
 *   - ordinal  — Framing (0–3 is a scale; neighbouring codes disagree less)
 *
 * Pure functions, no I/O. α of NaN (returned when fewer than two coded
 * units exist) means "not computable", not zero — callers must render
 * that distinction honestly.
 */

export type AlphaMetric = 'nominal' | 'ordinal'

/**
 * @param units one entry per unit (e.g. document × SDG × passage); each
 *   entry maps coder id → value. Coders who didn't code the unit are
 *   simply absent — missing data, not disagreement.
 * @param valueOrder required for the ordinal metric — the full ordered
 *   value vocabulary (e.g. ['0','1','2','3'] for Framing). Ignored for
 *   nominal.
 * @returns α in [−1, 1] (1 = perfect), or NaN when fewer than two
 *   values in total (nothing to compare).
 */
export function krippendorffAlpha(
  units: Array<Map<string, string>>,
  metric: AlphaMetric = 'nominal',
  valueOrder?: string[]
): number {
  // Coincidence matrix over observed values: M[v][v'] accumulates the
  // ordered pair count, each unit's pairs weighted 1/(m_u − 1).
  const M = new Map<string, Map<string, number>>()
  let totalPairs = 0

  for (const unit of units) {
    const values = [...unit.values()]
    const m = values.length
    if (m < 2) continue // a lone coder forms no coincidence pairs

    const weight = 1 / (m - 1)
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        if (i === j) continue
        const v = values[i]
        const v2 = values[j]
        let row = M.get(v)
        if (!row) {
          row = new Map()
          M.set(v, row)
        }
        row.set(v2, (row.get(v2) ?? 0) + weight)
        totalPairs += weight
      }
    }
  }

  if (totalPairs === 0) return NaN

  // Value totals n_v = Σ_{v'} M[v][v'].
  const n = new Map<string, number>()
  let nTotal = 0
  for (const [v, row] of M) {
    let sum = 0
    for (const count of row.values()) sum += count
    n.set(v, sum)
    nTotal += sum
  }

  const delta = (a: string, b: string): number => {
    if (a === b) return 0
    if (metric === 'nominal') return 1
    return ordinalDistance(a, b, n, valueOrder ?? [])
  }

  // D_o — observed disagreement: coincidence pairs weighted by δ.
  let dObserved = 0
  for (const [v, row] of M) {
    for (const [v2, count] of row) {
      dObserved += count * delta(v, v2)
    }
  }
  const dObservedNorm = dObserved / totalPairs

  // D_e — expected disagreement under independence, over the FULL value
  // cross-product (not just observed coincidence pairs — pairs that never
  // co-occur in one coder's unit still belong in the expected sum; the
  // two-value case masks this, every ≥3-value corpus exposes it):
  //   Σ_{v≠v'} n_v n_v' δ(v,v') / (n (n − 1))
  const values = [...n.keys()]
  let dExpected = 0
  for (const v of values) {
    for (const v2 of values) {
      if (v === v2) continue
      dExpected += (n.get(v) ?? 0) * (n.get(v2) ?? 0) * delta(v, v2)
    }
  }
  const dExpectedNorm = dExpected / (nTotal * (nTotal - 1))

  // Degenerate scale: only one distinct value among the coincidences —
  // disagreement is impossible, so reliability is perfect by definition.
  if (dExpectedNorm === 0) return dObservedNorm === 0 ? 1 : NaN
  return 1 - dObservedNorm / dExpectedNorm
}

/**
 * Krippendorff's ordinal distance: the normalised number of scale steps
 * between two values, using cumulative value frequencies so sparse
 * regions of the scale count less. Values outside `valueOrder` are
 * treated as maximally distant (they shouldn't occur — the caller owns
 * the vocabulary).
 */
function ordinalDistance(
  a: string,
  b: string,
  n: Map<string, number>,
  valueOrder: string[]
): number {
  const rankA = valueOrder.indexOf(a)
  const rankB = valueOrder.indexOf(b)
  if (rankA === -1 || rankB === -1) return 1

  const lo = Math.min(rankA, rankB)
  const hi = Math.max(rankA, rankB)
  const nTotal = [...n.values()].reduce((s, c) => s + c, 0)
  if (nTotal <= 1) return 1

  let steps = 0
  for (let g = lo; g < hi; g++) {
    const nHere = n.get(valueOrder[g]) ?? 0
    const nNext = n.get(valueOrder[g + 1]) ?? 0
    steps += (nHere + nNext) / 2
  }
  return steps / (nTotal - 1)
}
