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
    // Only adjacent disagreement, so the ordinal form has a clear expectation:
    // it discounts the (1,2) pair and reliability must read higher than nominal.
    // The corpus previously used here also contained a far (0,3) pair, on which
    // the ordinal form reads LOWER than nominal -- so the old assertion was not
    // a property of Krippendorff's metric at all, only of the missing square in
    // ordinalDistance. It passed against the broken function for that reason.
    const units = [
      unit({ a: '1', b: '2' }),
      unit({ a: '0', b: '0' }),
      unit({ a: '1', b: '1' }),
      unit({ a: '2', b: '2' }),
    ]
    const order = ['0', '1', '2', '3']
    expect(krippendorffAlpha(units, 'ordinal', order)).toBeGreaterThan(
      krippendorffAlpha(units, 'nominal')
    )
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

describe('krippendorffAlpha (ordinal — absolute values)', () => {
  // The two ordinal tests above assert only relative properties, and relative
  // properties are exactly what a wrong-but-monotone metric satisfies. These pin
  // absolute values against the independent `krippendorff` Python package, which
  // is what found the missing square in ordinalDistance — the earlier tests
  // passed against the broken function.
  //
  // Expected values were generated from that package on this exact corpus:
  //   nominal 0.4805970149   ordinal 0.8332500000   interval 0.8261738262

  const order = ['0', '1', '2', '3']

  // Three coders, disagreeing by at most one scale step — the Framing shape.
  const corpus = () => [
    unit({ a: '0', b: '0', c: '0' }),
    unit({ a: '1', b: '1', c: '2' }),
    unit({ a: '1', b: '0', c: '1' }),
    unit({ a: '2', b: '2', c: '2' }),
    unit({ a: '2', b: '3', c: '2' }),
    unit({ a: '3', b: '3', c: '3' }),
    unit({ a: '3', b: '2', c: '3' }),
    unit({ a: '0', b: '1', c: '0' }),
    unit({ a: '1', b: '1', c: '1' }),
    unit({ a: '2', b: '2', c: '3' }),
  ]

  it('matches the reference implementation — ordinal', () => {
    expect(krippendorffAlpha(corpus(), 'ordinal', order)).toBeCloseTo(0.83325, 9)
  })

  it('matches the reference implementation — nominal', () => {
    expect(krippendorffAlpha(corpus(), 'nominal')).toBeCloseTo(0.4805970149, 9)
  })

  it('is symmetric under reversing the value order', () => {
    // alpha cannot distinguish "coders drift upwards" from "coders drift
    // downwards"; a metric that did would be reporting direction, not
    // reliability. Catches an asymmetric difference function.
    const units = corpus()
    expect(krippendorffAlpha(units, 'ordinal', order)).toBeCloseTo(
      krippendorffAlpha(units, 'ordinal', [...order].reverse()),
      10
    )
  })

  it('relabels without moving the number', () => {
    // Same corpus, values renamed. A metric keyed on the label rather than the
    // position on the scale would shift here.
    const units = corpus()
    // Keyed by coder id, not by value: keying by value would collapse two
    // coders who agreed onto one entry and silently drop a coder.
    const renamed = units.map((u) => new Map([...u].map(([k, v]) => [k, `v${v}`])))
    expect(krippendorffAlpha(renamed, 'ordinal', ['v0', 'v1', 'v2', 'v3'])).toBeCloseTo(
      krippendorffAlpha(units, 'ordinal', order),
      10
    )
  })

  it('reads alpha high when coders agree and low when they do not', () => {
    // Perfect agreement is 1; total adjacent-step disagreement trends to 0.
    const perfect = [unit({ a: '1', b: '1', c: '1' }), unit({ a: '2', b: '2', c: '2' })]
    expect(krippendorffAlpha(perfect, 'ordinal', order)).toBeCloseTo(1, 10)
    const noisy = [
      unit({ a: '0', b: '1', c: '2' }),
      unit({ a: '1', b: '2', c: '3' }),
      unit({ a: '2', b: '3', c: '0' }),
    ]
    expect(krippendorffAlpha(noisy, 'ordinal', order)).toBeLessThan(
      krippendorffAlpha(corpus(), 'ordinal', order)
    )
  })
})
