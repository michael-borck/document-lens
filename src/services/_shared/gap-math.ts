/**
 * Pure metric math for the Tone–Substance Gap. No I/O. Substance and tone
 * are each normalized to -1..+1; the gap is the signed distance from a
 * reference line (positive = tone ahead of substance = performative).
 */

export type GapReference = 'diagonal' | 'residual'

/** Net keyword polarity as a ratio in -1..+1, or null if no matches. */
export function substanceRatio(positiveMatches: number, counterMatches: number): number | null {
  const total = positiveMatches + counterMatches
  if (total === 0) return null
  return (positiveMatches - counterMatches) / total
}

/** Absolute gap from the ideal 1:1 diagonal. */
export function gapFromDiagonal(tone: number, substance: number): number {
  return tone - substance
}

/** Least-squares fit of tone ~ substance. Null if <2 points or x-variance is 0. */
export function fitLine(
  points: Array<{ substance: number; tone: number }>
): { slope: number; intercept: number } | null {
  const n = points.length
  if (n < 2) return null
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const p of points) {
    sx += p.substance; sy += p.tone
    sxx += p.substance * p.substance; sxy += p.substance * p.tone
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}

/** Residual gap from a fitted corpus line. */
export function gapFromResidual(
  tone: number,
  substance: number,
  line: { slope: number; intercept: number }
): number {
  return tone - (line.slope * substance + line.intercept)
}
