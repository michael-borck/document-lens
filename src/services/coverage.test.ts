import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeCoverage } from './coverage'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/** First real service test — proves the analysis surface is reachable. */
describe('computeCoverage', () => {
  it('counts keyword matches per document, folding in synonyms', async () => {
    t = createTestDb()
    setDbDriver(t.driver)

    const pid = t.project()
    const list = t.keywordList()
    t.projectKeywordList(pid, list)
    const energy = t.keyword(list, 'energy', 'positive')
    const water = t.keyword(list, 'water', 'positive')
    t.synonym(energy, 'power', true) // synonym folds into "energy" concept
    t.keyword(list, 'greenwash', 'counter') // excluded by positive filter

    const doc = t.document({ extractedText: 'energy energy power and water flow' })
    t.addDocToProject(pid, doc)

    const m = await computeCoverage({
      projectId: pid,
      keywordListId: list,
      polarity: 'positive',
      axisId: null,
    })

    expect(m.documents).toHaveLength(1)
    expect(m.keywords.map((k) => k.text).sort()).toEqual(['energy', 'water'])
    expect(m.counts[doc][energy]).toBe(3) // 2× energy + 1× power synonym
    expect(m.counts[doc][water]).toBe(1)
    expect(m.lensTotals).toBeNull()
  })

  it('drops documents without extracted text', async () => {
    t = createTestDb()
    setDbDriver(t.driver)
    const pid = t.project()
    const list = t.keywordList()
    t.projectKeywordList(pid, list)
    t.keyword(list, 'energy')
    const empty = t.document({ extractedText: '' })
    t.addDocToProject(pid, empty)

    const m = await computeCoverage({ projectId: pid, keywordListId: list, polarity: 'positive', axisId: null })
    expect(m.documents).toHaveLength(0)
  })

  it('rolls up counts by a declared lens', async () => {
    t = createTestDb()
    setDbDriver(t.driver)

    const pid = t.project()
    const list = t.keywordList()
    t.projectKeywordList(pid, list)
    const energy = t.keyword(list, 'energy', 'positive')

    const sdg = t.lens({ name: 'SDG', type: 'keyword-attached' })
    const sdg7 = t.lensValue(sdg, 'SDG7', { sortOrder: 1 })
    t.declareListLens(list, sdg)
    t.keywordTag(energy, sdg, sdg7)

    const doc = t.document({ extractedText: 'energy energy energy' })
    t.addDocToProject(pid, doc)

    const m = await computeCoverage({ projectId: pid, keywordListId: list, polarity: 'positive', axisId: sdg })
    expect(m.lensValues?.map((v) => v.id)).toContain(sdg7)
    expect(m.lensTotals?.[doc][sdg7]).toBe(3)
  })
})
