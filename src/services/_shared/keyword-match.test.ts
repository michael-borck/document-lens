// src/services/_shared/keyword-match.test.ts
import { describe, it, expect } from 'vitest'
import { countConcept, findConceptSpans } from './keyword-match'

describe('findConceptSpans dedup', () => {
  it('counts a plain keyword normally', () => {
    expect(countConcept('energy and more energy', ['energy'])).toBe(2)
  })
  it('does not double-count a synonym overlapping the keyword', () => {
    // "clean energy" contains "energy"; one mention, not two
    expect(countConcept('we invest in clean energy', ['energy', 'clean energy'])).toBe(1)
  })
  it('counts separate mentions across keyword + synonym', () => {
    expect(countConcept('energy. later, clean energy', ['energy', 'clean energy'])).toBe(2)
  })
  it('returns spans sorted by start', () => {
    const spans = findConceptSpans('clean energy then energy', ['energy', 'clean energy'])
    expect(spans.map((s) => s.start)).toEqual([...spans.map((s) => s.start)].sort((a, b) => a - b))
  })
})
