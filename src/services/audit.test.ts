import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Anomalies mode calls api.detectStructuralMismatch; confirmations mode does not.
const { detectMock } = vi.hoisted(() => ({ detectMock: vi.fn() }))
vi.mock('./api', () => ({ api: { detectStructuralMismatch: detectMock } }))

import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { runAudit } from './audit'

let t: TestDb

beforeEach(() => detectMock.mockReset())
afterEach(() => {
  t?.close()
  resetDbDriver()
})

function seedAudit() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)
  t.keyword(list, 'carbon', 'positive')
  const fn = t.lens({ name: 'Function', type: 'document-context' })
  const teaching = t.lensValue(fn, 'Teaching', { displayName: 'Teaching' })
  const research = t.lensValue(fn, 'Research', { displayName: 'Research' })
  return { pid, list, fn, teaching, research }
}

describe('runAudit — anomalies', () => {
  it('flags keyword-bearing dislocations from the backend', async () => {
    const s = seedAudit()
    const doc = t.document({ extractedText: 'We reduce carbon emissions across operations.' })
    t.addDocToProject(s.pid, doc)
    detectMock.mockResolvedValue({
      total_sentences_analyzed: 1,
      total_sections: 1,
      dislocations: [{
        sentence_index: 0,
        sentence_text: 'We reduce carbon emissions across operations.',
        sentence_domain: 'Teaching',
        parent_section_index: 0,
        parent_section_domain: 'Research',
        dislocation_score: 0.6,
        severity: 'high',
      }],
    })

    const r = await runAudit({ projectId: s.pid, keywordListId: s.list, lensId: s.fn, mode: 'anomalies' })

    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({
      mode: 'anomalies', keyword: 'carbon', severity: 'high',
      sectionDomain: 'Research', sentenceDomain: 'Teaching',
    })
    expect(r.documentsAnalysed).toBe(1)
    expect(r.totalSentencesAnalysed).toBe(1)
    expect(r.cacheHits).toBe(0)
    expect(detectMock).toHaveBeenCalledTimes(1)
  })

  it('caches the backend response across runs', async () => {
    const s = seedAudit()
    const doc = t.document({ extractedText: 'Our carbon strategy spans every site.' })
    t.addDocToProject(s.pid, doc)
    detectMock.mockResolvedValue({
      total_sentences_analyzed: 1, total_sections: 1,
      dislocations: [{
        sentence_index: 0, sentence_text: 'Our carbon strategy spans every site.',
        sentence_domain: 'Teaching', parent_section_index: 0, parent_section_domain: 'Research',
        dislocation_score: 0.5, severity: 'medium',
      }],
    })
    const input = { projectId: s.pid, keywordListId: s.list, lensId: s.fn, mode: 'anomalies' as const }

    await runAudit(input)
    const second = await runAudit(input)

    expect(second.cacheHits).toBe(1)
    expect(detectMock).toHaveBeenCalledTimes(1) // second run served from cache
  })

  it('throws when given a keyword-attached lens', async () => {
    const s = seedAudit()
    const kwLens = t.lens({ name: 'Pillar', type: 'keyword-attached' })
    t.lensValue(kwLens, 'A'); t.lensValue(kwLens, 'B')
    await expect(
      runAudit({ projectId: s.pid, keywordListId: s.list, lensId: kwLens, mode: 'anomalies' })
    ).rejects.toThrow(/keyword-attached/)
  })

  it('returns empty without a backend call when no keyword matches the polarity', async () => {
    const s = seedAudit() // only a positive keyword
    const r = await runAudit({
      projectId: s.pid, keywordListId: s.list, lensId: s.fn, mode: 'anomalies', polarity: 'counter',
    })
    expect(r.findings).toHaveLength(0)
    expect(detectMock).not.toHaveBeenCalled()
  })
})

describe('runAudit — confirmations', () => {
  it('finds keywords in classified sections without any backend call', async () => {
    const s = seedAudit()
    const doc = t.document({ extractedText: 'full document text here' })
    t.addDocToProject(s.pid, doc)
    const sec = t.section(doc, {
      index: 0, start: 0, end: 40,
      text: 'carbon reduction is central to teaching.', classifiedAt: '2024-01-01',
    })
    t.sectionTag(sec, s.fn, s.teaching, 0.5)

    const r = await runAudit({ projectId: s.pid, keywordListId: s.list, lensId: s.fn, mode: 'confirmations' })

    expect(detectMock).not.toHaveBeenCalled()
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({
      mode: 'confirmations', keyword: 'carbon', sectionDomain: 'Teaching', severity: 'high', // 0.5 ≥ 0.45
    })
  })
})
