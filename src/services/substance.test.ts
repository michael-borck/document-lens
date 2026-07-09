import { describe, it, expect } from 'vitest'
import {
  repetitionRatio,
  diversityRatio,
  intensityPer1k,
  evidenceReuseRatio,
  coverageSpreadRatio,
  substanceConfidence,
  confidenceLabel,
  computeSubstanceSignals,
  type SubstanceInputs,
} from './substance'

const base: SubstanceInputs = {
  totalMatches: 40,
  uniqueKeywords: 10,
  enabledKeywords: 50,
  wordCount: 4000,
}

describe('repetitionRatio', () => {
  it('is matches per unique keyword', () => {
    expect(repetitionRatio(base)).toBe(4) // 40 / 10
  })
  it('is 1.0 when every match is a distinct keyword', () => {
    expect(repetitionRatio({ ...base, totalMatches: 10, uniqueKeywords: 10 })).toBe(1)
  })
  it('is 0 (not NaN/Infinity) when there are no matches', () => {
    expect(repetitionRatio({ ...base, totalMatches: 0, uniqueKeywords: 0 })).toBe(0)
  })
})

describe('diversityRatio', () => {
  it('is unique ÷ enabled', () => {
    expect(diversityRatio(base)).toBe(0.2) // 10 / 50
  })
  it('is 0 when no keywords are enabled', () => {
    expect(diversityRatio({ ...base, enabledKeywords: 0 })).toBe(0)
  })
  it('clamps to 1 if unique somehow exceeds enabled', () => {
    expect(diversityRatio({ ...base, uniqueKeywords: 60, enabledKeywords: 50 })).toBe(1)
  })
})

describe('intensityPer1k', () => {
  it('is matches per 1,000 words', () => {
    expect(intensityPer1k(base)).toBe(10) // 40 / (4000/1000)
  })
  it('is null when word count is unknown or zero', () => {
    expect(intensityPer1k({ ...base, wordCount: null })).toBeNull()
    expect(intensityPer1k({ ...base, wordCount: 0 })).toBeNull()
  })
})

describe('substanceConfidence', () => {
  it('is full when both word count and matches are ample', () => {
    expect(substanceConfidence({ ...base, wordCount: 5000, totalMatches: 50 })).toBe(1)
  })
  it('is limited by the weaker dimension (long doc, few matches)', () => {
    // 50k words but only 2 matches → matchConf = 2/20 = 0.1 dominates
    expect(substanceConfidence({ ...base, wordCount: 50000, totalMatches: 2 })).toBeCloseTo(0.1)
  })
  it('is 0 when word count is unknown', () => {
    expect(substanceConfidence({ ...base, wordCount: null })).toBe(0)
  })
})

describe('evidenceReuseRatio', () => {
  it('is reuse ÷ total matches', () => {
    expect(evidenceReuseRatio(15, 60)).toBe(0.25)
  })
  it('is 0 (not NaN) when there are no matches', () => {
    expect(evidenceReuseRatio(0, 0)).toBe(0)
  })
  it('is 1 when every match is on a multi-pillar keyword', () => {
    expect(evidenceReuseRatio(40, 40)).toBe(1)
  })
})

describe('coverageSpreadRatio', () => {
  it('is non-zero ÷ total cells', () => {
    expect(coverageSpreadRatio(3, 12)).toBe(0.25)
  })
  it('is 0 when the matrix is empty/unavailable', () => {
    expect(coverageSpreadRatio(0, 0)).toBe(0)
  })
})

describe('confidenceLabel', () => {
  it('buckets low/medium/high', () => {
    expect(confidenceLabel(0.1)).toBe('low')
    expect(confidenceLabel(0.5)).toBe('medium')
    expect(confidenceLabel(0.9)).toBe('high')
  })
})

describe('computeSubstanceSignals', () => {
  it('bundles all signals for a document', () => {
    const s = computeSubstanceSignals(base)
    expect(s).toEqual({ repetition: 4, diversity: 0.2, intensity: 10, confidence: 1 })
  })
})
