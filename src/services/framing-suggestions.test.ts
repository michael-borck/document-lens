import { describe, it, expect, afterEach, vi } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import {
  regenerateFramingSuggestions,
  listSuggestionsForDocument,
  acceptSuggestion,
  dismissSuggestion,
} from './framing-suggestions'
import { listAnnotationsForDocument } from './mention-annotations'

// Mock the backend client: framingSuggest is driven by hoisted state so
// tests can simulate the ClimateBERT rung (or its absence).
type FramingSuggestImpl = (passages: string[]) => Promise<{
  available: boolean
  error?: string
  results: Array<{
    climate: boolean
    commitment: boolean
    target: string
    target_score: number
    framing_value: string | null
    model_revision: string | null
  } | null>
}>

const h = vi.hoisted(() => {
  const state: { framingImpl: FramingSuggestImpl } = {
    framingImpl: async () => ({ available: false, results: [] }),
  }
  return { state }
})
vi.mock('./api', () => ({
  api: {
    framingSuggest: (passages: string[]) => h.state.framingImpl(passages),
  },
}))

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

  describe('ML rung merge (ClimateBERT)', () => {
    afterEach(() => {
      h.state.framingImpl = async (_passages: string[] = []) => ({ available: false, error: 'not loaded', results: [] })
    })

    it('merges model Aspirational suggestions with model@revision provenance', async () => {
      const s = seed()
      // s2 (the ordinary sentence) has no rung-0 hit — the model claims it.
      h.state.framingImpl = async (passages: string[]) => ({
        available: true,
        results: passages.map((p) =>
          p.includes('ordinary sentence')
            ? {
                climate: true,
                commitment: true,
                target: 'net-zero',
                target_score: 0.82,
                framing_value: '1',
                model_revision: 'climatebert/netzero-reduction@abc123def4',
              }
            : { climate: false, commitment: false, target: 'none', target_score: 0, framing_value: null, model_revision: null }
        ),
      })

      const r = await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
      expect(r.suggestionsCreated).toBe(2) // rung 0 unchanged
      expect(r.modelSuggestionsCreated).toBe(1)
      expect(r.modelUnavailable).toBe(false)

      const model = (await listSuggestionsForDocument(s.doc)).find((x) => x.value === '1')!
      expect(model.rule).toBe('climatebert/netzero-reduction@abc123def4')
      expect(model.score).toBeCloseTo(0.82)
    })

    it('skips model suggestions where rung-0 Quantified already claimed the span', async () => {
      const s = seed()
      // Model claims EVERYTHING as aspirational — including the span rung 0
      // already called Quantified. The stronger claim wins; no duplicate.
      h.state.framingImpl = async (passages: string[]) => ({
        available: true,
        results: passages.map(() => ({
          climate: true,
          commitment: true,
          target: 'net-zero',
          target_score: 0.9,
          framing_value: '1',
          model_revision: 'climatebert/netzero-reduction@abc123def4',
        })),
      })

      const r = await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
      expect(r.modelSuggestionsCreated).toBe(1) // only the Limit-passage span gets an Aspirational chip
      const rows = await listSuggestionsForDocument(s.doc)
      expect(rows.filter((x) => x.value === '1')).toHaveLength(1)
    })

    it('reports unavailable without failing the rung-0 pass', async () => {
      const s = seed()
      h.state.framingImpl = async () => {
        throw new Error('backend unreachable')
      }
      const r = await regenerateFramingSuggestions({ projectId: s.pid, keywordListId: s.list })
      expect(r.suggestionsCreated).toBe(2) // rung 0 unaffected
      expect(r.modelUnavailable).toBe(true)
    })
  })
})
