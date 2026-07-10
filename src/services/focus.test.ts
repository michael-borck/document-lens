import { describe, it, expect } from 'vitest'
import { meanStd, zScore, aggregateNotability } from './focus'

describe('meanStd', () => {
  it('computes population mean and std', () => {
    const { mean, std } = meanStd([2, 4, 4, 4, 5, 5, 7, 9])
    expect(mean).toBe(5)
    expect(std).toBe(2)
  })
  it('is {0,0} for an empty set', () => {
    expect(meanStd([])).toEqual({ mean: 0, std: 0 })
  })
  it('has zero std for a flat signal', () => {
    expect(meanStd([3, 3, 3]).std).toBe(0)
  })
})

describe('zScore', () => {
  it('is (value - mean) / std', () => {
    expect(zScore(7, 5, 2)).toBe(1)
    expect(zScore(3, 5, 2)).toBe(-1)
  })
  it('is 0 when there is no spread (avoids divide-by-zero)', () => {
    expect(zScore(3, 3, 0)).toBe(0)
  })
})

describe('aggregateNotability', () => {
  it('is the confidence-weighted sum of |z|', () => {
    expect(aggregateNotability([2, -1, 0], 1)).toBe(3)
    expect(aggregateNotability([2, -1, 0], 0.5)).toBe(1.5)
  })
  it('is 0 at zero confidence (thin evidence ranks last, however extreme)', () => {
    expect(aggregateNotability([5, -5], 0)).toBe(0)
  })
})
