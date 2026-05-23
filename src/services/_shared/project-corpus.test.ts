import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './test-db'
import { setDbDriver, resetDbDriver } from '../db'
import { loadProjectCorpus } from './project-corpus'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

function seed() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)
  const energy = t.keyword(list, 'energy', 'positive')
  t.synonym(energy, 'clean energy', true) // overlaps with "energy"
  t.synonym(energy, 'renewables', false) // disabled — excluded from termsFor
  const greenwash = t.keyword(list, 'greenwash', 'counter')
  const doc = t.document({ extractedText: 'clean energy and more energy' })
  const empty = t.document({ extractedText: '' })
  t.addDocToProject(pid, doc)
  t.addDocToProject(pid, empty)
  return { pid, list, energy, greenwash, doc }
}

describe('loadProjectCorpus', () => {
  it('drops documents without extracted text', async () => {
    const { pid, list } = seed()
    const corpus = await loadProjectCorpus({ projectId: pid, keywordListId: list, polarity: 'both' })
    expect(corpus.docs).toHaveLength(1)
  })

  it('filters keywords by polarity', async () => {
    const { pid, list } = seed()
    const pos = await loadProjectCorpus({ projectId: pid, keywordListId: list, polarity: 'positive' })
    expect(pos.keywords.map((k) => k.text)).toEqual(['energy'])

    const counter = await loadProjectCorpus({ projectId: pid, keywordListId: list, polarity: 'counter' })
    expect(counter.keywords.map((k) => k.text)).toEqual(['greenwash'])

    const both = await loadProjectCorpus({ projectId: pid, keywordListId: list, polarity: 'both' })
    expect(both.keywords.map((k) => k.text).sort()).toEqual(['energy', 'greenwash'])
  })

  it('termsFor folds in enabled synonyms only', async () => {
    const { pid, list, energy } = seed()
    const corpus = await loadProjectCorpus({ projectId: pid, keywordListId: list, polarity: 'positive' })
    const kw = corpus.keywords.find((k) => k.id === energy)!
    expect(corpus.termsFor(kw)).toEqual(['energy', 'clean energy']) // "renewables" disabled
  })

  it('countFor merges overlapping mentions (no double count)', async () => {
    const { pid, list, energy, doc } = seed()
    const corpus = await loadProjectCorpus({ projectId: pid, keywordListId: list, polarity: 'positive' })
    // "clean energy and more energy": "clean energy" counts once (not also as
    // bare "energy"), plus the standalone "energy" → 2, not 3.
    expect(corpus.countFor(doc, energy)).toBe(2)
    expect(corpus.spansFor(doc, energy)).toHaveLength(2)
  })
})
