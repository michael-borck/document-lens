// src/services/_shared/keyword-match.test.ts
import { describe, it, expect } from 'vitest'
import { countConcept, findConceptSpans, findTermSpans, buildTermPattern } from './keyword-match'

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

describe('prefix match mode (ADR-0037)', () => {
  it('exact mode stays whole-word: sustainability does not fire on sustainable', () => {
    expect(countConcept('sustainable development', ['sustainability'])).toBe(0)
  })

  it('prefix mode matches inflections', () => {
    const text = 'Sustainable growth makes the university more sustainable. Sustainability reporting.'
    expect(countConcept(text, ['sustain'])).toBe(0) // sanity: exact never matches
    expect(countConcept(text, ['sustain'], 'prefix')).toBe(3)
  })

  it('prefix mode keeps the word-start boundary: no match inside other words', () => {
    // 'sustain' must not fire inside 'unsustainable' or 'petrol' inside 'petroleum'
    expect(countConcept('unsustainable claims about petrol', ['sustain'], 'prefix')).toBe(0)
    expect(countConcept('Peterolumn is not Petrol', ['petrol'], 'prefix')).toBe(1)
  })

  it('prefix mode preserves the matched surface form for the audit trail', () => {
    const spans = findTermSpans('Sustainable, sustainability.', 'sustain', 'prefix')
    expect(spans.map((s) => s.matched)).toEqual(['Sustainable', 'sustainability'])
  })

  it('prefix mode extends the keyword with word characters — type the stem you want', () => {
    // The keyword text is matched literally, then may continue with word
    // characters: write the stem as the keyword's last token.
    expect(countConcept('water security and water securing measures', ['water secur'], 'prefix')).toBe(2)
    // Honest limit: prefix does NOT bridge stem changes (energy → energies).
    expect(countConcept('clean energies', ['clean energy'], 'prefix')).toBe(0)
  })

  it('prefix mode still respects punctuation and digits', () => {
    expect(countConcept('sustain; sustain4good sustainably', ['sustain'], 'prefix')).toBe(3)
  })

  it('synonyms stay exact even when the keyword is prefix mode', () => {
    // keyword 'sustain' (prefix) fires on the inflection; synonym 'green
    // growth' matches its literal phrase only — never an extended form.
    expect(countConcept('sustaining green growth today', ['sustain', 'green growth'], 'prefix')).toBe(2)
  })

  it('overlap dedup works with a prefix keyword: synonym span wins, one mention', () => {
    // keyword 'energy' prefix would match inside 'clean energy'; the longer
    // exact synonym span takes precedence and the mention counts once.
    expect(countConcept('we fund clean energy projects', ['energy', 'clean energy'], 'prefix')).toBe(1)
  })

  it('regex metacharacters are still escaped in prefix mode', () => {
    expect(countConcept('c.dot cxdot', ['c.dot'], 'prefix')).toBe(1)
  })

  it('buildTermPattern flags are sticky-free (global regex, reused safely)', () => {
    const p = buildTermPattern('sustain', 'prefix')
    expect(p.test('Sustainable')).toBe(true)
  })
})
