import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { computeNgrams } from './ngrams'

// Backs US-D-01 (frequent n-grams). Text is chosen so that specific bigram /
// trigram counts are exact — tokenisation lowercases, keeps alphabetic runs
// only (digits + punctuation dropped), and n-grams touching a stopword or a
// <2-char token are discarded.

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/** Seed a project with the given per-document extracted texts. */
function seed(texts: string[]): { pid: string; docIds: string[] } {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const docIds = texts.map((text, i) => {
    const id = t.document({ filename: `doc${i}.pdf`, title: `Doc ${i}`, extractedText: text })
    t.addDocToProject(pid, id)
    return id
  })
  return { pid, docIds }
}

describe('computeNgrams', () => {
  it('counts a repeated bigram across the corpus and drops sub-threshold ones', async () => {
    // "renewable energy" x3, "energy renewable" x2 in a single doc.
    const { pid } = seed(['renewable energy renewable energy renewable energy'])
    const { results, documentCount, totalTokens } = await computeNgrams({ projectId: pid, minCount: 3 })
    expect(documentCount).toBe(1)
    expect(totalTokens).toBe(6)
    const phrases = results.map((r) => r.phrase)
    expect(phrases).toContain('renewable energy')
    expect(phrases).not.toContain('energy renewable') // count 2 < minCount 3
    const re = results.find((r) => r.phrase === 'renewable energy')!
    expect(re.count).toBe(3)
    expect(re.size).toBe(2)
    expect(re.documentCount).toBe(1)
  })

  it('aggregates counts across documents and attributes per-document sources', async () => {
    const { pid, docIds } = seed([
      'renewable energy renewable energy renewable energy',
      'renewable energy renewable energy renewable energy',
    ])
    const { results } = await computeNgrams({ projectId: pid, minCount: 3 })
    const re = results.find((r) => r.phrase === 'renewable energy')!
    expect(re.count).toBe(6)
    expect(re.documentCount).toBe(2)
    expect(re.sources).toHaveLength(2)
    expect(re.sources.map((s) => s.documentId).sort()).toEqual([...docIds].sort())
    expect(re.sources.every((s) => s.count === 3)).toBe(true)
  })

  it('discards n-grams containing a stopword', async () => {
    const { pid } = seed(['the plan the plan the plan the plan'])
    const { results } = await computeNgrams({ projectId: pid, minCount: 2 })
    // Every bigram here touches the stopword "the".
    expect(results.every((r) => !r.phrase.split(' ').includes('the'))).toBe(true)
    expect(results.map((r) => r.phrase)).not.toContain('the plan')
  })

  it('drops digit-only tokens so page numbers / years do not appear', async () => {
    const { pid } = seed(['budget summary 2023 budget summary 2024 budget summary 2025'])
    const { results } = await computeNgrams({ projectId: pid, minCount: 3 })
    // "2023"/"2024"/"2025" are stripped; "budget summary" survives at count 3.
    expect(results.some((r) => /\d/.test(r.phrase))).toBe(false)
    expect(results.find((r) => r.phrase === 'budget summary')?.count).toBe(3)
  })

  it('honours minCount so a lower threshold surfaces more phrases', async () => {
    const { pid } = seed(['renewable energy renewable energy renewable energy'])
    const strict = await computeNgrams({ projectId: pid, minCount: 3 })
    const loose = await computeNgrams({ projectId: pid, minCount: 2 })
    expect(loose.results.map((r) => r.phrase)).toContain('energy renewable') // count 2
    expect(strict.results.map((r) => r.phrase)).not.toContain('energy renewable')
  })

  it('honours topN by trimming the sorted result set', async () => {
    const { pid } = seed(['renewable energy renewable energy renewable energy'])
    const { results } = await computeNgrams({ projectId: pid, minCount: 2, topN: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].phrase).toBe('renewable energy') // highest count sorts first
  })

  it('restricts to a single document in document-scoped mode', async () => {
    const { pid, docIds } = seed([
      'renewable energy renewable energy renewable energy',
      'carbon capture carbon capture carbon capture',
    ])
    const { results, documentCount } = await computeNgrams({ projectId: pid, documentId: docIds[1], minCount: 3 })
    expect(documentCount).toBe(1)
    const phrases = results.map((r) => r.phrase)
    expect(phrases).toContain('carbon capture')
    expect(phrases).not.toContain('renewable energy')
  })

  it('sorts results by count descending', async () => {
    // "solar power" x4, "wind power" x3.
    const { pid } = seed([
      'solar power solar power solar power solar power wind power wind power wind power',
    ])
    const { results } = await computeNgrams({ projectId: pid, minCount: 3 })
    const counts = results.map((r) => r.count)
    const sorted = [...counts].sort((a, b) => b - a)
    expect(counts).toEqual(sorted)
  })
})
