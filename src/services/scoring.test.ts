import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { evaluateScore } from './scoring'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

/** Seed a project whose keywords carry Pillar tags. Returns the ids needed. */
function seedPillars() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)

  const pillar = t.lens({ name: 'Pillar', type: 'keyword-attached' })
  const biosphere = t.lensValue(pillar, 'Biosphere')
  const society = t.lensValue(pillar, 'Society')
  t.declareListLens(list, pillar)

  const bio = t.keyword(list, 'bio', 'positive')
  t.keywordTag(bio, pillar, biosphere)
  const soc = t.keyword(list, 'soc', 'positive')
  t.keywordTag(soc, pillar, society)

  return { pid, list, pillar }
}

describe('evaluateScore — dispatch', () => {
  it('throws on an unsupported rule type', async () => {
    const { pid, list } = seedPillars()
    await expect(
      evaluateScore({ projectId: pid, keywordListId: list, definition: { type: 'mystery' }, polarity: 'positive' })
    ).rejects.toThrow(/Unsupported scoring rule type/)
  })
})

describe('evaluateScore — wedding-cake v1 mode', () => {
  it('falls back to Pillar coverage when no function lens is set', async () => {
    const { pid, list, pillar } = seedPillars()
    const doc = t.document({ extractedText: 'bio and soc' })
    t.addDocToProject(pid, doc)

    const ev = await evaluateScore({
      projectId: pid,
      keywordListId: list,
      definition: { type: 'wedding-cake', pillarLensId: pillar, requiredPillars: ['Biosphere', 'Society'] },
      polarity: 'positive',
    })

    expect(ev.mode).toBe('v1-prerequisite')
    const score = ev.perDocument.get(doc)!
    expect(score.score).toBe(2) // both pillars mentioned
    expect(score.max).toBe(2)
  })
})

describe('evaluateScore — wedding-cake full mode', () => {
  it('counts functions delivering every required pillar once classified', async () => {
    const { pid, list, pillar } = seedPillars()

    const fn = t.lens({ name: 'Function', type: 'document-context' })
    const teaching = t.lensValue(fn, 'Teaching')
    t.lensValue(fn, 'Research')

    // "bio soc" — both keyword matches land inside one section tagged Teaching.
    const doc = t.document({ extractedText: 'bio soc' })
    t.addDocToProject(pid, doc)
    const sec = t.section(doc, { index: 0, start: 0, end: 7, text: 'bio soc', classifiedAt: '2024-01-01' })
    t.sectionTag(sec, fn, teaching, 0.9)

    const ev = await evaluateScore({
      projectId: pid,
      keywordListId: list,
      definition: {
        type: 'wedding-cake',
        pillarLensId: pillar,
        functionLensId: fn,
        requiredPillars: ['Biosphere', 'Society'],
      },
      polarity: 'positive',
    })

    expect(ev.mode).toBe('full')
    const score = ev.perDocument.get(doc)!
    expect(score.score).toBe(1) // only Teaching delivers both pillars
    expect(score.max).toBe(2) // two function values
    expect(score.trace.find((s) => s.label === 'Teaching')!.status).toBe('met')
    expect(score.trace.find((s) => s.label === 'Research')!.status).toBe('unmet')
  })
})
