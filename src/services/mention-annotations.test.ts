import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import {
  listAnnotationsForDocument,
  setAnnotation,
  deleteAnnotation,
} from './mention-annotations'

let t: TestDb
afterEach(() => {
  t?.close()
  resetDbDriver()
})

function seed() {
  t = createTestDb()
  setDbDriver(t.driver)
  const list = t.keywordList()
  const kw = t.keyword(list, 'climate', 'positive', { matchMode: 'prefix' })
  const doc = t.document({ extractedText: 'climate action now' })
  return { list, kw, doc }
}

describe('mention annotations (ADR-0038)', () => {
  it('records and lists annotations per document', async () => {
    const { kw, doc } = seed()
    await setAnnotation({
      documentId: doc,
      keywordId: kw,
      startOffset: 0,
      endOffset: 12,
      axis: 'framing',
      value: '2',
    })
    await setAnnotation({
      documentId: doc,
      keywordId: kw,
      startOffset: 0,
      endOffset: 12,
      axis: 'prominence',
      value: 'leadership',
    })
    const rows = await listAnnotationsForDocument(doc)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.axis).sort()).toEqual(['framing', 'prominence'])
    expect(rows.every((r) => r.source === 'human')).toBe(true)
  })

  it('upserts on (document, keyword, start, axis) — one accepted value per axis', async () => {
    const { kw, doc } = seed()
    await setAnnotation({
      documentId: doc, keywordId: kw, startOffset: 0, endOffset: 12,
      axis: 'framing', value: '1',
    })
    const updated = await setAnnotation({
      documentId: doc, keywordId: kw, startOffset: 0, endOffset: 12,
      axis: 'framing', value: '2',
    })
    const rows = await listAnnotationsForDocument(doc)
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe('2')
    expect(rows[0].id).toBe(updated.id)
  })

  it('same span, different keyword → separate rows', async () => {
    const { list, doc } = seed()
    const kw2 = t.keyword(list, 'carbon', 'positive')
    await setAnnotation({ documentId: doc, keywordId: kw2, startOffset: 0, endOffset: 12, axis: 'framing', value: '0' })
    await setAnnotation({ documentId: doc, keywordId: kw2, startOffset: 0, endOffset: 12, axis: 'prominence', value: 'body' })
    // (kw from seed() has none)
    const rows = await listAnnotationsForDocument(doc)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.keywordId === kw2)).toBe(true)
  })

  it('ai-suggested-accepted requires and keeps provenance', async () => {
    const { kw, doc } = seed()
    await expect(
      setAnnotation({
        documentId: doc, keywordId: kw, startOffset: 0, endOffset: 12,
        axis: 'framing', value: '3', source: 'ai-suggested-accepted',
      })
    ).rejects.toThrow(/suggestedBy/)
    await setAnnotation({
      documentId: doc, keywordId: kw, startOffset: 0, endOffset: 12,
      axis: 'framing', value: '3', source: 'ai-suggested-accepted',
      suggestedBy: 'climatebert/netzero-reduction@abc123', suggestionScore: 0.91,
    })
    const [row] = await listAnnotationsForDocument(doc)
    expect(row.value).toBe('3')
    expect(row.source).toBe('ai-suggested-accepted')
    expect(row.suggestedBy).toBe('climatebert/netzero-reduction@abc123')
    expect(row.suggestionScore).toBeCloseTo(0.91)
  })

  it('deletes an annotation', async () => {
    const { kw, doc } = seed()
    const row = await setAnnotation({
      documentId: doc, keywordId: kw, startOffset: 0, endOffset: 12,
      axis: 'provenance', value: 'mandated',
    })
    await deleteAnnotation(row.id)
    expect(await listAnnotationsForDocument(doc)).toHaveLength(0)
  })
})
