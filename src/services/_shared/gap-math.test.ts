// src/services/_shared/gap-math.test.ts
import { describe, it, expect } from 'vitest'
import { substanceRatio, gapFromDiagonal, fitLine, gapFromResidual } from './gap-math'

describe('substanceRatio', () => {
  it('returns null when there are no matches', () => {
    expect(substanceRatio(0, 0)).toBeNull()
  })
  it('+1 when all positive, -1 when all counter', () => {
    expect(substanceRatio(5, 0)).toBe(1)
    expect(substanceRatio(0, 5)).toBe(-1)
  })
  it('0 when balanced', () => {
    expect(substanceRatio(3, 3)).toBe(0)
  })
})

describe('gapFromDiagonal', () => {
  it('is tone minus substance (positive = performative)', () => {
    expect(gapFromDiagonal(0.8, -0.5)).toBeCloseTo(1.3)
    expect(gapFromDiagonal(-0.2, 0.6)).toBeCloseTo(-0.8)
  })
})

describe('fitLine', () => {
  it('returns null with fewer than 2 points', () => {
    expect(fitLine([{ substance: 0, tone: 0 }])).toBeNull()
  })
  it('recovers slope and intercept of a clean line', () => {
    const line = fitLine([
      { substance: 0, tone: 1 },
      { substance: 1, tone: 2 },
      { substance: 2, tone: 3 },
    ])
    expect(line!.slope).toBeCloseTo(1)
    expect(line!.intercept).toBeCloseTo(1)
  })
  it('returns null when all x identical (degenerate)', () => {
    expect(fitLine([{ substance: 1, tone: 0 }, { substance: 1, tone: 1 }])).toBeNull()
  })
})

describe('gapFromResidual', () => {
  it('is distance from the fitted line', () => {
    const line = { slope: 1, intercept: 1 }
    expect(gapFromResidual(2.5, 1, line)).toBeCloseTo(0.5)
  })
})
