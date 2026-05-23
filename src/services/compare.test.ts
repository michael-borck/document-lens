import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeCompare } from './compare'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/**
 *   Alpha (Acme, 2019): "energy energy water"        -> pos 3, distinct 2
 *   Beta  (Beta, 2020): "energy greenwash greenwash" -> pos 1, counter 2
 *   (empty doc, no text) -> excluded from ranking
 * Keywords carry Pillar tags so the score metric (v1) works.
 */
function seed() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)

  const pillar = t.lens({ name: 'Pillar', type: 'keyword-attached' })
  const B = t.lensValue(pillar, 'Biosphere')
  const S = t.lensValue(pillar, 'Society')
  t.declareListLens(list, pillar)

  const energy = t.keyword(list, 'energy'); t.keywordTag(energy, pillar, B)
  const water = t.keyword(list, 'water'); t.keywordTag(water, pillar, S)
  t.keyword(list, 'greenwash', 'counter')

  const alpha = t.document({ title: 'Alpha', year: 2019, company: 'Acme', extractedText: 'energy energy water' })
  const beta = t.document({ title: 'Beta', year: 2020, company: 'Beta', extractedText: 'energy greenwash greenwash' })
  const empty = t.document({ title: 'Empty', extractedText: '' })
  for (const d of [alpha, beta, empty]) t.addDocToProject(pid, d)

  const rule = { type: 'wedding-cake', pillarLensId: pillar, requiredPillars: ['Biosphere', 'Society'] }
  return { pid, list, energy, alpha, beta, rule }
}

describe('computeCompare', () => {
  it('ranks docs by match-count desc and reports excluded', async () => {
    const { pid, list, alpha, beta } = seed()
    const r = await computeCompare({
      projectId: pid, keywordListId: list, metric: 'match-count', polarity: 'positive', group: 'none',
    })
    expect(r.points.map((p) => [p.documentId, p.value])).toEqual([
      [alpha, 3],
      [beta, 1],
    ])
    expect(r.excluded).toBe(1) // the empty doc
  })

  it('distinct-keywords counts unique matching keywords', async () => {
    const { pid, list, alpha, beta } = seed()
    const r = await computeCompare({
      projectId: pid, keywordListId: list, metric: 'distinct-keywords', polarity: 'positive', group: 'none',
    })
    const byId = Object.fromEntries(r.points.map((p) => [p.documentId, p.value]))
    expect(byId[alpha]).toBe(2) // energy + water
    expect(byId[beta]).toBe(1) // energy
  })

  it('pos-minus-counter subtracts counter matches', async () => {
    const { pid, list, alpha, beta } = seed()
    const r = await computeCompare({
      projectId: pid, keywordListId: list, metric: 'pos-minus-counter', polarity: 'positive', group: 'none',
    })
    const byId = Object.fromEntries(r.points.map((p) => [p.documentId, p.value]))
    expect(byId[alpha]).toBe(3) // 3 pos - 0 counter
    expect(byId[beta]).toBe(-1) // 1 pos - 2 counter
  })

  it('narrows to a single keyword', async () => {
    const { pid, list, energy, alpha, beta } = seed()
    const r = await computeCompare({
      projectId: pid, keywordListId: list, metric: 'match-count', polarity: 'positive', group: 'none',
      keywordId: energy,
    })
    expect(r.keywordLabel).toBe('energy')
    const byId = Object.fromEntries(r.points.map((p) => [p.documentId, p.value]))
    expect(byId[alpha]).toBe(2)
    expect(byId[beta]).toBe(1)
  })

  it('applies a company filter', async () => {
    const { pid, list, alpha } = seed()
    const r = await computeCompare({
      projectId: pid, keywordListId: list, metric: 'match-count', polarity: 'positive', group: 'none',
      companies: ['Acme'],
    })
    expect(r.points.map((p) => p.documentId)).toEqual([alpha])
  })

  it('scores via the Score Evaluator (v1 mode)', async () => {
    const { pid, list, alpha, beta, rule } = seed()
    const r = await computeCompare({
      projectId: pid, keywordListId: list, metric: 'score', polarity: 'positive', group: 'none',
      scoringRule: rule,
    })
    expect(r.scoreFallback).toBe(true)
    expect(r.points.map((p) => [p.documentId, p.value])).toEqual([
      [alpha, 2], // both pillars mentioned
      [beta, 1], // only Biosphere
    ])
  })
})
