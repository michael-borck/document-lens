import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The classifier batches section texts to api.mapDomainsBatch and tags each
// section by the returned primary_domain. Mock it to classify every section as
// "Teaching" (which must equal domainLabelFor(teaching) — here just 'Teaching').
const { mapBatchMock } = vi.hoisted(() => ({ mapBatchMock: vi.fn() }))
vi.mock('./api', () => ({ api: { mapDomainsBatch: mapBatchMock } }))

import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { classifyProjectFunctions, getClassificationStatus } from './classification'

let t: TestDb

beforeEach(() => {
  mapBatchMock.mockReset()
  // Default: classify every input section as Teaching.
  mapBatchMock.mockImplementation(async (texts: string[], domains: string[]) =>
    texts.map(() => ({
      total_sections: 1,
      domains_analyzed: domains,
      mappings: [{
        section_text: '', section_index: 0,
        primary_domain: 'Teaching', similarity_score: 0.8,
        all_domain_scores: {}, confidence: 'high',
      }],
      domain_distribution: {},
      average_confidence: 0.8,
    }))
  )
})
afterEach(() => {
  t?.close()
  resetDbDriver()
})

// One paragraph over detectSections' 80-char minimum.
const PARA = 'Our teaching programs emphasise active learning, curriculum design, and student engagement across the year.'

function seed() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const fn = t.lens({ name: 'Function', type: 'document-context' })
  const teaching = t.lensValue(fn, 'Teaching', { displayName: 'Teaching' })
  const research = t.lensValue(fn, 'Research', { displayName: 'Research' })
  return { pid, fn, teaching, research }
}

describe('classifyProjectFunctions', () => {
  it('detects, classifies, and tags sections; status reflects it', async () => {
    const s = seed()
    const doc = t.document({ extractedText: PARA })
    t.addDocToProject(s.pid, doc)

    const result = await classifyProjectFunctions(s.pid, s.fn)

    expect(result.documentsProcessed).toBe(1)
    expect(result.documentsUnavailable).toBe(0)
    expect(result.totalSectionsTagged).toBeGreaterThan(0)
    expect(mapBatchMock).toHaveBeenCalled()

    const status = await getClassificationStatus(s.pid, s.fn)
    expect(status.totalDocuments).toBe(1)
    expect(status.classifiedDocuments).toBe(1)
    expect(status.unavailableDocuments).toBe(0)
  })

  it('skips documents with no extracted text', async () => {
    const s = seed()
    const empty = t.document({ extractedText: '' })
    t.addDocToProject(s.pid, empty)

    const result = await classifyProjectFunctions(s.pid, s.fn)

    expect(result.documentsUnavailable).toBe(1)
    expect(result.documentsProcessed).toBe(0)
    expect(mapBatchMock).not.toHaveBeenCalled()
  })

  it('requires a lens with at least two values', async () => {
    const s = seed()
    const solo = t.lens({ name: 'Solo', type: 'document-context' })
    t.lensValue(solo, 'Only')
    await expect(classifyProjectFunctions(s.pid, solo)).rejects.toThrow(/at least 2 values/)
  })
})

describe('getClassificationStatus', () => {
  it('reports an unclassified project as not classified', async () => {
    const s = seed()
    const doc = t.document({ extractedText: PARA })
    t.addDocToProject(s.pid, doc)
    const status = await getClassificationStatus(s.pid, s.fn)
    expect(status).toMatchObject({ totalDocuments: 1, classifiedDocuments: 0 })
  })
})
