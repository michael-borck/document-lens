import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeCoverage } from './coverage'
import { computeTrack } from './track'
import { computeCompare } from './compare'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/**
 * The headline Phase #4 test: because Coverage, Track, and Compare all count
 * through the same Project Corpus, their positive-match totals must agree by
 * construction.
 */
describe('cross-workflow reconciliation', () => {
  it('Coverage total == Σ Track match-count == Σ Compare match-count', async () => {
    t = createTestDb()
    setDbDriver(t.driver)

    const pid = t.project()
    const list = t.keywordList()
    t.projectKeywordList(pid, list)
    t.keyword(list, 'energy', 'positive')
    t.keyword(list, 'water', 'positive')
    t.keyword(list, 'greenwash', 'counter') // counter — excluded from positive totals

    const d1 = t.document({ year: 2019, extractedText: 'energy energy water greenwash' }) // 3 positive
    const d2 = t.document({ year: 2020, extractedText: 'water and energy' }) // 2 positive
    t.addDocToProject(pid, d1)
    t.addDocToProject(pid, d2)

    // Coverage total across all positive keywords.
    const cov = await computeCoverage({ projectId: pid, keywordListId: list, polarity: 'positive', axisId: null })
    const coverageTotal = Object.values(cov.counts)
      .flatMap((perKw) => Object.values(perKw))
      .reduce((a, b) => a + b, 0)

    // Track match-count, all topics, summed over years.
    const trk = await computeTrack({
      projectId: pid,
      keywordListId: list,
      topic: { kind: 'all' },
      measure: 'match-count',
      group: 'none',
      polarity: 'positive',
    })
    const trackTotal = trk.series[0].points.reduce((a, p) => a + p.value, 0)

    // Compare match-count, summed over documents.
    const cmp = await computeCompare({
      projectId: pid,
      keywordListId: list,
      metric: 'match-count',
      polarity: 'positive',
      group: 'none',
    })
    const compareTotal = cmp.points.reduce((a, p) => a + p.value, 0)

    expect(coverageTotal).toBe(5)
    expect(trackTotal).toBe(5)
    expect(compareTotal).toBe(5)
    expect(new Set([coverageTotal, trackTotal, compareTotal]).size).toBe(1)
  })
})
