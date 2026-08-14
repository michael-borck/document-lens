import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { loadProjectCorpus } from './_shared/project-corpus'
import { buildPerMentionFiles } from './per-mention-export'
import { parseCsv } from './csv'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

// Two paragraphs; paragraph 2 opens with a verbatim repeat of sentence 1.
//   s1: two SDG-13 terms in one sentence  -> collapse to ONE row (2 mentions)
//   s2: two SDG-6 terms in one sentence   -> one row
//   s3: verbatim repeat of s1             -> kept, flagged 'dupe'
//   s4: counter term (LNG, SDG 13)        -> its own row, polarity counter
const P1 =
  'We commit to net zero and zero carbon by 2030. Our water strategy protects each catchment area.'
const P2 = 'We commit to net zero and zero carbon by 2030. New LNG plant opened.'
const TEXT = `${P1}\n\n${P2}`

function seed() {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)

  const sdg = t.lens({ name: 'SDG', type: 'keyword-attached' })
  const sdg6 = t.lensValue(sdg, '6', { displayName: 'SDG 6 — Clean Water and Sanitation', sortOrder: 6 })
  const sdg13 = t.lensValue(sdg, '13', { displayName: 'SDG 13 — Climate Action', sortOrder: 13 })
  const pillar = t.lens({ name: 'Pillar', type: 'keyword-attached' })
  const bio = t.lensValue(pillar, 'biosphere', { displayName: 'Biosphere' })
  t.declareListLens(list, sdg)
  t.declareListLens(list, pillar)

  const fn = t.lens({ name: 'Function', type: 'document-context' })
  const operations = t.lensValue(fn, 'operations', { displayName: 'Campus operations' })

  for (const [text, value] of [
    ['net zero', sdg13],
    ['zero carbon', sdg13],
    ['water', sdg6],
    ['catchment', sdg6],
  ] as const) {
    const kw = t.keyword(list, text, 'positive')
    t.keywordTag(kw, sdg, value)
    t.keywordTag(kw, pillar, bio)
  }
  const lng = t.keyword(list, 'LNG', 'counter')
  t.keywordTag(lng, sdg, sdg13)
  t.keywordTag(lng, pillar, bio)

  const doc = t.document({ extractedText: TEXT, company: 'Test University', year: 2025 })
  t.addDocToProject(pid, doc)
  const sec0 = t.section(doc, { index: 0, start: 0, end: P1.length, text: P1 })
  t.sectionTag(sec0, fn, operations, 0.9)
  t.section(doc, { index: 1, start: P1.length + 2, end: TEXT.length, text: P2 }) // untagged

  return { pid, list, fn }
}

async function runExport() {
  const s = seed()
  const posCorpus = await loadProjectCorpus({ projectId: s.pid, keywordListId: s.list, polarity: 'positive' })
  const cntCorpus = await loadProjectCorpus({ projectId: s.pid, keywordListId: s.list, polarity: 'counter' })
  const files = await buildPerMentionFiles({
    docs: posCorpus.docs,
    posCorpus,
    cntCorpus,
    keywordListId: s.list,
    subjectLensId: s.fn,
  })
  const mentions = parseCsv(files.find((f) => f.filename === 'mentions.csv')!.content)
  const counts = parseCsv(files.find((f) => f.filename === 'mention-counts.csv')!.content)
  return { mentions, counts }
}

describe('buildPerMentionFiles', () => {
  it('collapses same-SDG terms in one passage into one row (one row per SDG per passage)', async () => {
    const { mentions } = await runExport()
    const [header, ...rows] = mentions
    expect(rows).toHaveLength(4)

    const col = (name: string) => header.indexOf(name)
    const first = rows[0]
    expect(first[col('SDG')]).toBe('SDG 13 — Climate Action')
    expect(first[col('word')]).toBe('net zero | zero carbon')
    expect(first[col('mentions_in_passage')]).toBe('2')
    expect(first[col('passage')]).toBe('We commit to net zero and zero carbon by 2030.')
  })

  it('gives different SDGs in different passages their own rows, in reading order', async () => {
    const { mentions } = await runExport()
    const [header, ...rows] = mentions
    const col = (name: string) => header.indexOf(name)
    expect(rows.map((r) => r[col('SDG')])).toEqual([
      'SDG 13 — Climate Action',
      'SDG 6 — Clean Water and Sanitation',
      'SDG 13 — Climate Action',
      'SDG 13 — Climate Action',
    ])
    expect(rows[1][col('word')]).toBe('water | catchment')
  })

  it('flags a verbatim repeated passage as dupe instead of dropping it', async () => {
    const { mentions } = await runExport()
    const [header, ...rows] = mentions
    const col = (name: string) => header.indexOf(name)
    expect(rows[0][col('duplicate')]).toBe('')
    expect(rows[2][col('passage')]).toBe(rows[0][col('passage')])
    expect(rows[2][col('duplicate')]).toBe('dupe')
  })

  it('keeps counter keywords as their own rows with polarity, never merged into positive rows', async () => {
    const { mentions } = await runExport()
    const [header, ...rows] = mentions
    const col = (name: string) => header.indexOf(name)
    const counter = rows[3]
    expect(counter[col('polarity')]).toBe('counter')
    expect(counter[col('word')]).toBe('LNG')
    expect(counter[col('passage')]).toBe('New LNG plant opened.')
  })

  it('pre-fills finding columns and leaves every judgement column empty', async () => {
    const { mentions } = await runExport()
    const [header, ...rows] = mentions
    const col = (name: string) => header.indexOf(name)
    for (const row of rows) {
      expect(row[col('university')]).toBe('Test University')
      expect(row[col('relevance')]).toBe('')
      expect(row[col('framing')]).toBe('')
      expect(row[col('prominence')]).toBe('')
      expect(row[col('notes')]).toBe('')
      expect(row[col('provenance')]).toBe('Voluntary')
    }
    // Domain is a suggestion from the section's Function tag; the untagged
    // second paragraph stays empty rather than guessing.
    expect(rows[0][col('domain_suggested')]).toBe('Campus operations')
    expect(rows[3][col('domain_suggested')]).toBe('')
  })

  it('reports raw mention counts per document alongside the deduplicated row count', async () => {
    const { counts } = await runExport()
    const [header, docRow, totalRow] = counts
    const col = (name: string) => header.indexOf(name)
    expect(docRow[col('raw_mentions_positive')]).toBe('6') // net zero ×2, zero carbon ×2, water, catchment
    expect(docRow[col('raw_mentions_counter')]).toBe('1') // LNG
    expect(docRow[col('raw_mentions_total')]).toBe('7')
    expect(docRow[col('deduplicated_rows')]).toBe('4')
    expect(totalRow[0]).toBe('TOTAL')
    expect(totalRow[col('raw_mentions_total')]).toBe('7')
  })
})
