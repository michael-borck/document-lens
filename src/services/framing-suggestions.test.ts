import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import {
  regenerateFramingSuggestions,
  listSuggestionsForDocument,
  acceptSuggestion,
  dismissSuggestion,
} from './framing-suggestions'
import { listAnnotationsForDocument } from './mention-annotations'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

// s1: keyword mention inside a Quantified passage (direction + number + date)
// s2: keyword mention in a plain passage — no rule fires
// s3: keyword mention inside a Limit passage
const TEXT =
  'We commit to net zero, cutting emissions 40 per cent by 2030. ' +
  'The net zero wording appears again in an ordinary sentence. ' +
  'Our net zero duty means we operate within planetary boundaries.'

function seed() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)
  t.keyword(list, 'net zero', 'positive')
  const doc = t.document({ extractedText: TEXT, company: 'Test University', year: 2025 })
  t.addDocToProject(pid, doc)
  return { pid, list, doc }
}

describe('framing suggestions (ADR-0039 rung 0)', () => {
  it('suggests only where a rule fires, with the rule as provenance', async () => {
    const s = seed()
    const r = await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
    expect(r.documentsScanned).toBe(1)
    expect(r.suggestionsCreated).toBe(2) // s1 quantified + s3 limit; s2 silent

    const rows = await listSuggestionsForDocument(s.doc)
    expect(rows.map((x) => x.value).sort()).toEqual(['2', '3'])
    expect(rows.every((x) => x.rule === 'quantified-number-date' || x.rule === 'limit-boundary')).toBe(true)
    expect(rows.every((x) => x.status === 'open')).toBe(true)
    expect(rows.every((x) => x.score === null)).toBe(true) // deterministic
  })

  it('regeneration is idempotent and never resurrects dismissed rows', async () => {
    const s = seed()
    await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
    const rows = await listSuggestionsForDocument(s.doc)
    const quantified = rows.find((x) => x.value === '2')!

    await dismissSuggestion(quantified.id)
    const r2 = await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
    expect(r2.suggestionsCreated).toBe(0) // unique key — dismissed row blocks resurrection

    const after = await listSuggestionsForDocument(s.doc)
    expect(after).toHaveLength(2)
    expect(after.find((x) => x.id === quantified.id)!.status).toBe('dismissed')
  })

  it('accepting writes the human annotation with rule provenance', async () => {
    const s = seed()
    await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
    const rows = await listSuggestionsForDocument(s.doc)
    const limit = rows.find((x) => x.value === '3')!

    await acceptSuggestion(limit.id)

    const annotations = await listAnnotationsForDocument(s.doc)
    expect(annotations).toHaveLength(1)
    expect(annotations[0]).toMatchObject({
      axis: 'framing',
      value: '3',
      source: 'rule-suggested-accepted',
      suggestedBy: 'limit-boundary',
    })

    const after = (await listSuggestionsForDocument(s.doc)).find((x) => x.id === limit.id)!
    expect(after.status).toBe('accepted')
  })

  it('returns no suggestions when no rule fires anywhere', async () => {
    const s = seed()
    t.db
      .prepare('UPDATE documents SET extracted_text = ? WHERE id = ?')
      .run('The net zero mention sits in an ordinary sentence. Nothing fires.', s.doc)
    const r = await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
    expect(r.suggestionsCreated).toBe(0)
    expect(await listSuggestionsForDocument(s.doc)).toHaveLength(0)
  })
})
