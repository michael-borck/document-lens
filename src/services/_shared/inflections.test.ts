import { describe, it, expect } from 'vitest'
import { findInflections, inflectionBases, isInflectionOf } from './inflections'

describe('isInflectionOf (grammatical inflections only)', () => {
  it('accepts plurals and verb forms of the same lemma', () => {
    expect(isInflectionOf('ecosystems', 'ecosystem')).toBe(true)
    expect(isInflectionOf('ecosystem', 'ecosystems')).toBe(true) // both directions
    expect(isInflectionOf('sustaining', 'sustain')).toBe(true)
    expect(isInflectionOf('sustained', 'sustain')).toBe(true)
    expect(isInflectionOf('policies', 'policy')).toBe(true) // ies → y
    expect(isInflectionOf('applied', 'apply')).toBe(true)   // ied → y
    expect(isInflectionOf('running', 'run')).toBe(true)     // doubled consonant
    expect(isInflectionOf('planned', 'plan')).toBe(true)    // doubled consonant
    expect(isInflectionOf('partnerships', 'partnership')).toBe(true)
    expect(isInflectionOf('Ecosystems', 'ecosystem')).toBe(true) // case-insensitive
  })

  it('rejects derivational relatives — meaning changes, not forms', () => {
    expect(isInflectionOf('sustainable', 'sustain')).toBe(false)
    expect(isInflectionOf('government', 'govern')).toBe(false)
    expect(isInflectionOf('ecology', 'ecosystem')).toBe(false)
    expect(isInflectionOf('equality', 'equal')).toBe(false)
  })

  it('rejects unrelated words that merely share a prefix', () => {
    expect(isInflectionOf('Peterolumn', 'petrol')).toBe(false)
    expect(isInflectionOf('sustainability', 'sustain')).toBe(false) // derivational
  })

  it('rejects identity and words too short to judge', () => {
    expect(isInflectionOf('ecosystem', 'ecosystem')).toBe(false)
    expect(isInflectionOf('sea', 'sea')).toBe(false) // identity, even short
    expect(isInflectionOf('eco', 'ecosystem')).toBe(false) // prefix ≠ inflection
  })
})

describe('inflectionBases', () => {
  it('always includes the word itself', () => {
    expect(inflectionBases('sustain').has('sustain')).toBe(true)
  })

  it('repairs the standard orthographies', () => {
    expect(inflectionBases('policies').has('policy')).toBe(true)
    expect(inflectionBases('running').has('run')).toBe(true)
    expect(inflectionBases('planned').has('plan')).toBe(true)
    expect(inflectionBases('applied').has('apply')).toBe(true)
  })
})

describe('findInflections', () => {
  const stats = new Map([
    ['ecosystems', { count: 12, documentCount: 3 }],
    ['ecosystem', { count: 40, documentCount: 5 }],
    ['ecological', { count: 9, documentCount: 4 }],
    ['the', { count: 999, documentCount: 5 }],
  ])

  it('returns only inflections, ranked by frequency', () => {
    const out = findInflections('ecosystem', stats)
    expect(out.map((c) => c.text)).toEqual(['ecosystems'])
    expect(out[0]).toMatchObject({ count: 12, documentCount: 3 })
  })

  it('excludes the keyword, its synonyms, and other keywords', () => {
    const out = findInflections('ecosystem', stats, ['ecosystems', 'ecosystem'])
    expect(out).toEqual([])
  })

  it('is case-stable on corpus tokens', () => {
    const lower = new Map([['ecosystems', { count: 2, documentCount: 1 }]])
    expect(findInflections('Ecosystem', lower)).toHaveLength(1)
  })
})
