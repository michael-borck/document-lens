import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SimilarTermsResponse } from './api'

// Mock api.findSimilarTerms as a PLAIN async function driven by hoisted state,
// not a vi.fn spy. vitest 2.x attributes a spy's thrown error to the test even
// when the code under test catches it across a module boundary; a plain
// function sidesteps that. We track calls by hand for the "never called" check.
const h = vi.hoisted(() => ({
  state: {
    calls: 0,
    impl: (async () => ({ results: [] })) as (
      sources: string[],
      candidates: string[],
      opts: unknown,
    ) => Promise<SimilarTermsResponse>,
  },
}))
vi.mock('./api', () => ({
  api: {
    findSimilarTerms: (sources: string[], candidates: string[], opts: unknown) => {
      h.state.calls++
      return h.state.impl(sources, candidates, opts)
    },
  },
}))

import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { discoverSynonyms } from './synonym-discovery'

let t: TestDb

beforeEach(() => {
  h.state.calls = 0
  h.state.impl = async () => ({ results: [] })
})
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
  // "clean energy" ×2, "energy initiatives" ×1, "energy goals" ×1 → corpus pool.
  const doc = t.document({ extractedText: 'clean energy initiatives and clean energy goals' })
  t.addDocToProject(pid, doc)
  return { pid, list, energy }
}

describe('discoverSynonyms', () => {
  it('ranks candidates, attaches corpus metadata, drops the self-match', async () => {
    const { pid, list } = seed()
    h.state.impl = async () => ({
      results: [{
        source: 'energy',
        candidates: [
          { candidate: 'clean energy', similarity: 0.85 },
          { candidate: 'energy initiatives', similarity: 0.7 },
          { candidate: 'energy', similarity: 0.99 }, // self → filtered
        ],
      }],
    })

    const r = await discoverSynonyms({
      projectId: pid, keywordListId: list, polarity: 'positive', minNgramFrequency: 1,
    })

    expect(r.unavailable).toBe(false)
    expect(r.perKeyword).toHaveLength(1)
    const cands = r.perKeyword[0].candidates
    expect(cands.map((c) => c.text)).toEqual(['clean energy', 'energy initiatives'])
    expect(cands.find((c) => c.text === 'clean energy')).toMatchObject({
      similarity: 0.85, count: 2, documentCount: 1,
    })
  })

  it('filters out already-accepted synonyms', async () => {
    const { pid, list, energy } = seed()
    t.synonym(energy, 'clean energy', true) // already accepted
    h.state.impl = async () => ({
      results: [{
        source: 'energy',
        candidates: [
          { candidate: 'clean energy', similarity: 0.85 },
          { candidate: 'energy initiatives', similarity: 0.7 },
        ],
      }],
    })

    const r = await discoverSynonyms({
      projectId: pid, keywordListId: list, polarity: 'positive', minNgramFrequency: 1,
    })
    expect(r.perKeyword[0].candidates.map((c) => c.text)).toEqual(['energy initiatives'])
  })

  it('reports unavailable when the embedding model returns 503', async () => {
    const { pid, list } = seed()
    h.state.impl = async () => {
      throw new Error('Embedding model unavailable — backend returned 503.')
    }
    const r = await discoverSynonyms({
      projectId: pid, keywordListId: list, polarity: 'positive', minNgramFrequency: 1,
    })
    expect(r.unavailable).toBe(true)
    expect(r.perKeyword).toHaveLength(0)
  })

  it('returns empty and never calls the backend when no keywords match the polarity', async () => {
    const { pid, list } = seed() // only a positive keyword exists
    const r = await discoverSynonyms({
      projectId: pid, keywordListId: list, polarity: 'counter', minNgramFrequency: 1,
    })
    expect(r.perKeyword).toHaveLength(0)
    expect(h.state.calls).toBe(0)
  })
})
