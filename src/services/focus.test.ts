import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { meanStd, zScore, aggregateNotability, computeFocus } from './focus'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

describe('meanStd', () => {
  it('computes population mean and std', () => {
    const { mean, std } = meanStd([2, 4, 4, 4, 5, 5, 7, 9])
    expect(mean).toBe(5)
    expect(std).toBe(2)
  })
  it('is {0,0} for an empty set', () => {
    expect(meanStd([])).toEqual({ mean: 0, std: 0 })
  })
  it('has zero std for a flat signal', () => {
    expect(meanStd([3, 3, 3]).std).toBe(0)
  })
})

describe('zScore', () => {
  it('is (value - mean) / std', () => {
    expect(zScore(7, 5, 2)).toBe(1)
    expect(zScore(3, 5, 2)).toBe(-1)
  })
  it('is 0 when there is no spread (avoids divide-by-zero)', () => {
    expect(zScore(3, 3, 0)).toBe(0)
  })
})

describe('aggregateNotability', () => {
  it('is the confidence-weighted sum of |z|', () => {
    expect(aggregateNotability([2, -1, 0], 1)).toBe(3)
    expect(aggregateNotability([2, -1, 0], 0.5)).toBe(1.5)
  })
  it('is 0 at zero confidence (thin evidence ranks last, however extreme)', () => {
    expect(aggregateNotability([5, -5], 0)).toBe(0)
  })
})

/**
 * A panel corpus: a sparse 2016 cohort and a dense 2025 cohort, mimicking a
 * decade in which disclosure grew. Every document is 1,000 words, so intensity
 * (matches per 1,000 words) equals its match count and the arithmetic is
 * checkable by hand.
 *
 *   2016: 1, 1, 1, 4 matches   ← the 4 is a standout FOR ITS YEAR
 *   2025: 10, 10, 10, 10 matches
 *
 * Pooled, the 2016 standout (4) sits below the corpus mean of 5.875 and looks
 * unremarkable; the sparse 2016 documents look like the outliers. Within its
 * year it is +1.7σ. That inversion is the whole point of stratifying.
 */
function seedPanel() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)
  const pillar = t.lens({ name: 'Pillar', type: 'keyword-attached' })
  const B = t.lensValue(pillar, 'Biosphere')
  t.declareListLens(list, pillar)
  const energy = t.keyword(list, 'energy')
  t.keywordTag(energy, pillar, B)

  const add = (title: string, year: number, matches: number) => {
    const id = t.document({
      title,
      year,
      extractedText: Array(matches).fill('energy').join(' and '),
      wordCount: 1000,
    })
    t.addDocToProject(pid, id)
    return id
  }
  const standout2016 = add('2016-standout', 2016, 4)
  for (let i = 0; i < 3; i++) add(`2016-sparse-${i}`, 2016, 1)
  for (let i = 0; i < 4; i++) add(`2025-${i}`, 2025, 10)
  return { pid, list, standout2016 }
}

const intensityHit = (doc: { hits: Array<{ signal: string }> } | undefined) =>
  doc?.hits.some((h) => h.signal === 'intensity') ?? false

describe('computeFocus year stratification', () => {
  it('finds the within-year standout that pooling hides', async () => {
    const { pid, list, standout2016 } = seedPanel()
    const r = await computeFocus({ projectId: pid, keywordListId: list, scoringRule: null })

    expect(r.stratify).toBe('year')
    expect(intensityHit(r.documents.find((d) => d.documentId === standout2016))).toBe(true)
  })

  it('pooling across years hides it, and flags the sparse documents instead', async () => {
    const { pid, list, standout2016 } = seedPanel()
    const r = await computeFocus({
      projectId: pid, keywordListId: list, scoringRule: null, stratify: 'corpus',
    })

    expect(r.stratify).toBe('corpus')
    expect(intensityHit(r.documents.find((d) => d.documentId === standout2016))).toBe(false)
    // The sparse 2016 documents are the pooled outliers — the calendar artefact.
    const sparse = r.documents.filter((d) => d.title.startsWith('2016-sparse'))
    expect(sparse.some((d) => intensityHit(d))).toBe(true)
  })

  it('defaults to year stratification', async () => {
    const { pid, list } = seedPanel()
    const r = await computeFocus({ projectId: pid, keywordListId: list, scoringRule: null })
    expect(r.stratify).toBe('year')
  })

  it('applies the year filter and reports the narrowed corpus size', async () => {
    const { pid, list } = seedPanel()
    const r = await computeFocus({
      projectId: pid, keywordListId: list, scoringRule: null, yearMin: 2025,
    })
    expect(r.corpusSize).toBe(4)
    expect(r.documents.every((d) => d.year === 2025)).toBe(true)
  })

  it('falls back to corpus stats for a year with too few peers, and says so', async () => {
    const { pid, list } = seedPanel()
    // A lone 2020 document: a cohort of one has σ = 0, which would silently
    // zero its notability if we z-scored it against itself.
    const lonely = t.document({ title: '2020-only', year: 2020, extractedText: 'energy and energy', wordCount: 1000 })
    t.addDocToProject(pid, lonely)

    const r = await computeFocus({ projectId: pid, keywordListId: list, scoringRule: null })
    expect(r.fellBackToCorpus).toBeGreaterThanOrEqual(1)
    expect(r.documents.find((d) => d.documentId === lonely)?.notability).toBeGreaterThan(0)
  })
})
