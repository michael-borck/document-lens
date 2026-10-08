import { describe, it, expect } from 'vitest'
import { krippendorffAlpha } from './krippendorff'

/** Map-literal helper: unit from {coder: value}. */
const unit = (entries: Record<string, string>) => new Map(Object.entries(entries))

describe('krippendorffAlpha (nominal)', () => {
  it('is 1 for perfect agreement', () => {
    const units = [
      unit({ a: 'yes', b: 'yes' }),
      unit({ a: 'no', b: 'no' }),
      unit({ a: 'yes', b: 'yes' }),
    ]
    expect(krippendorffAlpha(units, 'nominal')).toBeCloseTo(1)
  })

  it('matches the hand-computed 2-coder case (α = 0.64)', () => {
    // A: [1,1,2,2,1]  B: [1,2,2,2,1] — 4/5 agree, one (1,2) unit.
    // Coincidences: o11=4, o22=4, o12=o21=1 → n1=5, n2=5, n=10.
    // D_o = 2/10 = 0.2; D_e = (5·5+5·5)/90 = 50/90.
    // α = 1 − 0.2/0.5556 = 0.64 — π for the same data is 0.6; the n−1
    // finite-sample correction explains the difference.
    const units = [
      unit({ a: '1', b: '1' }),
      unit({ a: '1', b: '2' }),
      unit({ a: '2', b: '2' }),
      unit({ a: '2', b: '2' }),
      unit({ a: '1', b: '1' }),
    ]
    expect(krippendorffAlpha(units, 'nominal')).toBeCloseTo(0.64, 6)
  })

  it('handles missing coders without imputing (protocol rule)', () => {
    // Same as the 0.64 case plus units only one coder coded — they must
    // not change α.
    const units = [
      unit({ a: '1', b: '1' }),
      unit({ a: '1', b: '2' }),
      unit({ a: '2', b: '2' }),
      unit({ a: '2', b: '2' }),
      unit({ a: '1', b: '1' }),
      unit({ a: '2' }),
      unit({ b: '1' }),
    ]
    expect(krippendorffAlpha(units, 'nominal')).toBeCloseTo(0.64, 6)
  })

  it('supports three coders on one unit (pairs weighted 1/(m−1))', () => {
    // All three agree → α = 1 regardless of m.
    const units = [unit({ a: 'x', b: 'x', c: 'x' })]
    expect(krippendorffAlpha(units, 'nominal')).toBeCloseTo(1)
  })

  it('returns NaN when fewer than two coded values exist', () => {
    expect(Number.isNaN(krippendorffAlpha([unit({ a: 'x' })], 'nominal'))).toBe(true)
    expect(Number.isNaN(krippendorffAlpha([], 'nominal'))).toBe(true)
  })

  it('returns 1 on a constant scale (disagreement is impossible)', () => {
    // Single unit, two coders, same value: D_e is 0 — nothing can
    // disagree, so reliability is perfect by definition.
    const units = [unit({ a: 'x', b: 'x' })]
    expect(krippendorffAlpha(units, 'nominal')).toBeCloseTo(1)
  })
})

describe('krippendorffAlpha (ordinal — Framing 0–3)', () => {
  it('weighs adjacent disagreement less than far disagreement (vs nominal)', () => {
    // Mixed data: one adjacent disagreement (1,2) + one far (0,3) + an
    // agreeing anchor. The ordinal metric discounts the adjacent pair, so
    // reliability reads higher than the nominal metric on the same data.
    const units = [
      unit({ a: '1', b: '2' }),
      unit({ a: '0', b: '3' }),
      unit({ a: '0', b: '0' }),
    ]
    const order = ['0', '1', '2', '3']
    const alphaOrdinal = krippendorffAlpha(units, 'ordinal', order)
    const alphaNominal = krippendorffAlpha(units, 'nominal')
    expect(alphaOrdinal).toBeGreaterThan(alphaNominal)
  })

  it('equals the nominal result when all disagreements are the same distance', () => {
    // A single disagreement type (0,2) scales D_o and D_e uniformly, so
    // the metric cannot move α — a useful invariance check.
    const units = [
      unit({ a: '0', b: '2' }),
      unit({ a: '0', b: '0' }),
      unit({ a: '2', b: '2' }),
    ]
    const order = ['0', '1', '2', '3']
    expect(krippendorffAlpha(units, 'ordinal', order)).toBeCloseTo(
      krippendorffAlpha(units, 'nominal'),
      6
    )
  })
})
