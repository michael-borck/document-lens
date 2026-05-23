import { describe, it, expect, afterEach, vi } from 'vitest'

// Mock the backend client: gap fetches per-section sentiment via
// api.analyzeSentimentBatch. Return a fixed tone (0.6) for every section so
// the gap math is deterministic. Mocking the module also avoids constructing
// the real ApiClient (which probes window).
vi.mock('./api', () => ({
  api: {
    analyzeSentimentBatch: vi.fn(async (items: Array<{ id: string; text: string }>) => ({
      results: items.map((it) => ({
        id: it.id,
        sentiment: { sentiment: 'neutral', score: 0.6, confidence: 1 },
      })),
      aggregate: { average_score: 0.6, distribution: {} },
    })),
  },
}))

import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeGap } from './gap'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

// Each paragraph must clear detectSections' 80-char minimum to count as a section.
const POS_PARA = 'Our good governance reflects good stewardship and good progress across the whole organisation today.'
const NEG_PARA = 'Critics call it bad practice, bad faith, and frankly bad reporting that undermines the stated outcomes.'
const POS_PARA_2 = 'We continue good work with good intent and good results delivered consistently for our community now.'

function seedTwoYears() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)
  t.keyword(list, 'good', 'positive')
  t.keyword(list, 'bad', 'counter')

  // d2019: one positive paragraph + one counter paragraph (two sections).
  const d2019 = t.document({ title: 'Doc 2019', year: 2019, extractedText: `${POS_PARA}\n\n${NEG_PARA}` })
  // d2020: one positive paragraph (one section).
  const d2020 = t.document({ title: 'Doc 2020', year: 2020, extractedText: POS_PARA_2 })
  t.addDocToProject(pid, d2019)
  t.addDocToProject(pid, d2020)
  return { pid, list, d2019, d2020 }
}

describe('computeGap', () => {
  it('computes substance/tone/gap per level and aggregates over time', async () => {
    const { pid, list, d2019 } = seedTwoYears()
    const data = await computeGap({ projectId: pid, keywordListId: list, reference: 'diagonal' })

    expect(data.singleDocument).toBe(false)

    // document level: one point per doc.
    expect(data.byLevel.document).toHaveLength(2)
    const doc2019 = data.byLevel.document.find((p) => p.documentId === d2019)!
    // 3 positive + 3 counter → substance (3-3)/6 = 0; tone mocked 0.6; gap 0.6-0.
    expect(doc2019.substance).toBeCloseTo(0, 5)
    expect(doc2019.tone).toBeCloseTo(0.6, 5)
    expect(doc2019.gap).toBeCloseTo(0.6, 5)

    // section level: two sections for d2019 + one for d2020.
    expect(data.byLevel.section).toHaveLength(3)

    // keyword level: per (doc, keyword); substance is the keyword's polarity.
    const goodPoint = data.byLevel.keyword.find((p) => p.documentId === d2019 && p.label.startsWith('good'))!
    expect(goodPoint.substance).toBe(1) // positive keyword
    expect(goodPoint.gap).toBeCloseTo(0.6 - 1, 5)

    // over time: 2019 and 2020, each one document.
    expect(data.overTimeAvailable).toBe(true)
    expect(data.overTime.map((o) => o.year)).toEqual([2019, 2020])
    const y2019 = data.overTime.find((o) => o.year === 2019)!
    expect(y2019.avgGap).toBeCloseTo(0.6, 5) // doc2019 gap
    const y2020 = data.overTime.find((o) => o.year === 2020)!
    expect(y2020.avgGap).toBeCloseTo(0.6 - 1, 5) // doc2020: substance 1, tone 0.6
  })

  it('flags a single-document project and no over-time trend', async () => {
    t = createTestDb()
    setDbDriver(t.driver)
    const pid = t.project()
    const list = t.keywordList()
    t.projectKeywordList(pid, list)
    t.keyword(list, 'good', 'positive')
    const only = t.document({ title: 'Solo', year: 2021, extractedText: POS_PARA })
    t.addDocToProject(pid, only)

    const data = await computeGap({ projectId: pid, keywordListId: list, reference: 'diagonal' })
    expect(data.singleDocument).toBe(true)
    expect(data.overTimeAvailable).toBe(false) // <2 years
  })

  it('serves cached section tones without re-calling the backend', async () => {
    const { pid, list } = seedTwoYears()
    const { api } = await import('./api')
    await computeGap({ projectId: pid, keywordListId: list, reference: 'diagonal' })
    const callsAfterFirst = (api.analyzeSentimentBatch as ReturnType<typeof vi.fn>).mock.calls.length
    await computeGap({ projectId: pid, keywordListId: list, reference: 'diagonal' })
    // second run reads the analysis_cache → no additional backend call
    expect((api.analyzeSentimentBatch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst)
  })
})
