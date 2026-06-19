import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeCoverage2D } from './coverage-2d'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/**
 * Builds a project where keyword matches land at known offsets and sections
 * carry known Function tags, so cell placement + the three "unplaced" buckets
 * can be asserted exactly.
 *
 * Text: "bio soc eco out non"  (offsets: bio 0, soc 4, eco 8, out 12, non 16)
 *   sec0 [0,7)  tagged Teaching   -> bio, soc land here (placed)
 *   sec1 [8,11) NOT tagged        -> eco lands here (no section tag)
 *   (12..)      no section         -> out lands here (outside sections)
 *   non has no pillar tag          -> unplaced (no keyword tag)
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
  const E = t.lensValue(pillar, 'Economy')
  t.declareListLens(list, pillar)

  const fn = t.lens({ name: 'Function', type: 'document-context' })
  const teaching = t.lensValue(fn, 'Teaching')
  const research = t.lensValue(fn, 'Research')

  const bio = t.keyword(list, 'bio'); t.keywordTag(bio, pillar, B)
  const soc = t.keyword(list, 'soc'); t.keywordTag(soc, pillar, S)
  const eco = t.keyword(list, 'eco'); t.keywordTag(eco, pillar, E)
  const out = t.keyword(list, 'out'); t.keywordTag(out, pillar, B)
  t.keyword(list, 'non') // intentionally untagged

  const doc = t.document({ extractedText: 'bio soc eco out non' })
  t.addDocToProject(pid, doc)
  const sec0 = t.section(doc, { index: 0, start: 0, end: 7, text: 'bio soc' })
  t.sectionTag(sec0, fn, teaching, 0.9)
  t.section(doc, { index: 1, start: 8, end: 11, text: 'eco' }) // no tag

  return { pid, list, pillar, fn, doc, B, S, E, teaching, research }
}

describe('computeCoverage2D', () => {
  it('places matches by keyword Pillar tag × section Function tag', async () => {
    const s = seed()
    const m = await computeCoverage2D({
      projectId: s.pid,
      keywordListId: s.list,
      rowAxisId: s.pillar,
      colAxisId: s.fn,
      polarity: 'positive',
    })

    expect(m.cells[s.doc][s.B][s.teaching]).toBe(1) // bio
    expect(m.cells[s.doc][s.S][s.teaching]).toBe(1) // soc
    expect(m.cells[s.doc][s.E][s.teaching]).toBe(0) // eco landed in an untagged section
    expect(m.cells[s.doc][s.B][s.research]).toBe(0)
    expect(m.aggregate[s.B][s.teaching]).toBe(1)
    expect(m.aggregate[s.S][s.teaching]).toBe(1)
  })

  it('counts the three unplaced buckets', async () => {
    const s = seed()
    const m = await computeCoverage2D({
      projectId: s.pid,
      keywordListId: s.list,
      rowAxisId: s.pillar,
      colAxisId: s.fn,
      polarity: 'positive',
    })

    expect(m.totalMatches).toBe(4) // bio, soc, eco, out entered the position loop
    expect(m.unplacedNoKeywordTag).toBe(1) // "non" — no pillar tag
    expect(m.unplacedNoSectionTag).toBe(1) // "eco" — section had no Function tag
    expect(m.unplacedOutsideSections).toBe(1) // "out" — landed past every section
  })

  it('returns an empty matrix when no keywords match the polarity', async () => {
    const s = seed() // all keywords are positive
    const m = await computeCoverage2D({
      projectId: s.pid,
      keywordListId: s.list,
      rowAxisId: s.pillar,
      colAxisId: s.fn,
      polarity: 'counter',
    })
    expect(m.documents).toHaveLength(0)
    expect(m.totalMatches).toBe(0)
  })

  it('throws when the row lens is not declared by the keyword list', async () => {
    const s = seed()
    const otherPillar = t.lens({ name: 'Undeclared', type: 'keyword-attached' })
    await expect(
      computeCoverage2D({
        projectId: s.pid,
        keywordListId: s.list,
        rowAxisId: otherPillar,
        colAxisId: s.fn,
        polarity: 'positive',
      })
    ).rejects.toThrow(/isn't declared/)
  })
})
