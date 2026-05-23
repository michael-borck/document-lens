import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeTrack } from './track'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/**
 * Three docs across two years plus one year-unknown doc. Keywords carry Pillar
 * tags so the score measure (v1 mode) can be exercised too.
 *
 *   d2019 (Acme, 2019): "energy energy water greenwash"  -> pos 3, counter 1
 *   d2020 (Beta, 2020): "water energy"                   -> pos 2
 *   dnull (Acme, null): "energy"                          -> pos 1 (year unknown)
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

  const d2019 = t.document({ year: 2019, company: 'Acme', extractedText: 'energy energy water greenwash' })
  const d2020 = t.document({ year: 2020, company: 'Beta', extractedText: 'water energy' })
  const dnull = t.document({ year: null, company: 'Acme', extractedText: 'energy' })
  for (const d of [d2019, d2020, dnull]) t.addDocToProject(pid, d)

  const rule = { type: 'wedding-cake', pillarLensId: pillar, requiredPillars: ['Biosphere', 'Society'] }
  return { pid, list, energy, rule }
}

describe('computeTrack', () => {
  it('buckets match-count by year and reports the year-unknown bucket', async () => {
    const { pid, list } = seed()
    const r = await computeTrack({
      projectId: pid, keywordListId: list,
      topic: { kind: 'all' }, measure: 'match-count', group: 'none', polarity: 'positive',
    })
    expect(r.series).toHaveLength(1)
    expect(r.series[0].points).toEqual([
      { year: 2019, value: 3, documentCount: 1 },
      { year: 2020, value: 2, documentCount: 1 },
    ])
    expect(r.yearUnknown).toEqual({ documentCount: 1, matchCount: 1 })
    expect(r.yearRange).toEqual({ min: 2019, max: 2020 })
    expect(r.totalDocs).toBe(2)
  })

  it('narrows to a single keyword topic', async () => {
    const { pid, list, energy } = seed()
    const r = await computeTrack({
      projectId: pid, keywordListId: list,
      topic: { kind: 'keyword', keywordId: energy }, measure: 'match-count', group: 'none', polarity: 'positive',
    })
    expect(r.series[0].points).toEqual([
      { year: 2019, value: 2, documentCount: 1 }, // only "energy"
      { year: 2020, value: 1, documentCount: 1 },
    ])
  })

  it('coverage-percent is share of docs with ≥1 match', async () => {
    const { pid, list } = seed()
    const r = await computeTrack({
      projectId: pid, keywordListId: list,
      topic: { kind: 'all' }, measure: 'coverage-percent', group: 'none', polarity: 'positive',
    })
    expect(r.series[0].points.map((p) => p.value)).toEqual([100, 100])
  })

  it('group=polarity returns positive + counter series', async () => {
    const { pid, list } = seed()
    const r = await computeTrack({
      projectId: pid, keywordListId: list,
      topic: { kind: 'all' }, measure: 'match-count', group: 'polarity', polarity: 'positive',
    })
    expect(r.series.map((s) => s.name)).toEqual(['Positive', 'Counter'])
    const counter = r.series.find((s) => s.name === 'Counter')!
    // 2019 has one greenwash; 2020 has a doc but zero counter matches → 0.
    expect(counter.points).toEqual([
      { year: 2019, value: 1, documentCount: 1 },
      { year: 2020, value: 0, documentCount: 1 },
    ])
  })

  it('group=company returns one series per company', async () => {
    const { pid, list } = seed()
    const r = await computeTrack({
      projectId: pid, keywordListId: list,
      topic: { kind: 'all' }, measure: 'match-count', group: 'company', polarity: 'positive',
    })
    expect(r.series.map((s) => s.name).sort()).toEqual(['Acme', 'Beta'])
    const beta = r.series.find((s) => s.name === 'Beta')!
    expect(beta.points).toEqual([{ year: 2020, value: 2, documentCount: 1 }])
  })

  it('score measure averages the per-doc score per year (v1 mode)', async () => {
    const { pid, list, rule } = seed()
    const r = await computeTrack({
      projectId: pid, keywordListId: list,
      topic: { kind: 'all' }, measure: 'score', group: 'none', polarity: 'positive',
      scoringRule: rule,
    })
    expect(r.scoreFallback).toBe(true) // no function lens → v1 prerequisite
    // both 2019 and 2020 docs mention both required pillars → score 2 each year
    expect(r.series[0].points).toEqual([
      { year: 2019, value: 2, documentCount: 1 },
      { year: 2020, value: 2, documentCount: 1 },
    ])
  })
})
