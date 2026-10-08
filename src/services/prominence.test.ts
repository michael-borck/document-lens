import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver, runBatch } from './db'
import {
  listDocumentHeadings,
  replaceDocumentHeadingsOps,
} from './document-headings'
import { setZoneOverride } from './documents'
import {
  detectLeadershipZone,
  zoneForOffset,
  getLeadershipZone,
} from './prominence'

let t: TestDb
afterEach(() => {
  t?.close()
  resetDbDriver()
})

function heading(overrides: { documentId?: string; startOffset: number; endOffset: number; text: string }) {
  return {
    documentId: 'doc',
    pageNumber: 1,
    fontSize: 18,
    bold: true,
    ...overrides,
  }
}

describe('detectLeadershipZone (ADR-0032 fallback vocabulary)', () => {
  const total = 1000

  it('fires on the researchers\u2019 heading patterns', () => {
    for (const text of [
      "Vice-Chancellor's introduction",
      'From the Vice-Chancellor',
      'Message from the Vice-Chancellor',
      "Chancellor's report",
      'Vice Chancellor statement',
    ]) {
      const zone = detectLeadershipZone([heading({ text, startOffset: 10, endOffset: 40 })], total)
      expect(zone, text).not.toBeNull()
      expect(zone!.startOffset).toBe(10)
    }
  })

  it('does not fire on non-leadership headings', () => {
    for (const text of [
      "Director's report",
      'Chair\u2019s letter',
      'Operations',
      'Financial statements',
    ]) {
      expect(detectLeadershipZone([heading({ text, startOffset: 0, endOffset: 20 })], total)).toBeNull()
    }
  })

  it('zone runs to the next heading, or to the end of the document', () => {
    const headings = [
      heading({ text: "Vice-Chancellor's introduction", startOffset: 0, endOffset: 34 }),
      heading({ text: 'Teaching and learning', startOffset: 400, endOffset: 421 }),
    ]
    const zone = detectLeadershipZone(headings, total)!
    expect(zone.endOffset).toBe(400)

    const alone = detectLeadershipZone([headings[0]], total)!
    expect(alone.endOffset).toBe(total)
  })

  it('earliest match wins when several headings match', () => {
    const headings = [
      heading({ text: 'Operations', startOffset: 0, endOffset: 10 }),
      heading({ text: 'From the Vice-Chancellor', startOffset: 500, endOffset: 524 }),
      heading({ text: "Chancellor's statement", startOffset: 700, endOffset: 722 }),
    ]
    const zone = detectLeadershipZone(headings, total)!
    expect(zone.startOffset).toBe(500)
  })

  it('zoneForOffset: inside the zone is leadership, everywhere else body', () => {
    const headings = [
      heading({ text: "Vice-Chancellor's introduction", startOffset: 100, endOffset: 130 }),
      heading({ text: 'Teaching and learning', startOffset: 400, endOffset: 421 }),
    ]
    const zone = detectLeadershipZone(headings, 1000)!
    expect(zone.endOffset).toBe(400)
    expect(zoneForOffset(zone, 100)).toBe('leadership')
    expect(zoneForOffset(zone, 399)).toBe('leadership')
    expect(zoneForOffset(zone, 99)).toBe('body')
    expect(zoneForOffset(zone, 400)).toBe('body')
    expect(zoneForOffset(null, 500)).toBe('body')
  })
})

describe('document headings storage', () => {
  it('replaces and lists headings for a document', async () => {
    t = createTestDb()
    setDbDriver(t.driver)
    const doc = t.document({ extractedText: 'Heading\n\nBody text' })

    await runBatch(
      replaceDocumentHeadingsOps(doc, [
        { pageNumber: 1, text: 'Heading', fontSize: 18, bold: true, startOffset: 0, endOffset: 7 },
        { pageNumber: 2, text: 'Later Heading', fontSize: 16, bold: false, startOffset: 9, endOffset: 22 },
      ])
    )

    const rows = await listDocumentHeadings(doc)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ text: 'Heading', bold: true, startOffset: 0 })
    expect(rows[1]).toMatchObject({ text: 'Later Heading', bold: false, startOffset: 9 })

    // Replace clears prior rows.
    await runBatch(
      replaceDocumentHeadingsOps(doc, [
        { pageNumber: 1, text: 'Only Heading', fontSize: 17, bold: true, startOffset: 0, endOffset: 12 },
      ])
    )
    expect(await listDocumentHeadings(doc)).toHaveLength(1)
  })

  it('getLeadershipZone joins storage + derivation; null with no headings', async () => {
    t = createTestDb()
    setDbDriver(t.driver)
    const text = "Vice-Chancellor's introduction\n\nOur climate strategy delivered.\n\nOperations"
    const doc = t.document({ extractedText: text })

    expect(await getLeadershipZone(doc)).toBeNull() // nothing detected yet

    const headingStart = 0
    const nextHeading = text.indexOf('Operations')
    await runBatch(
      replaceDocumentHeadingsOps(doc, [
        { pageNumber: 1, text: "Vice-Chancellor's introduction", fontSize: 18, bold: true, startOffset: headingStart, endOffset: 31 },
        { pageNumber: 1, text: 'Operations', fontSize: 16, bold: true, startOffset: nextHeading, endOffset: nextHeading + 10 },
      ])
    )

    const zone = await getLeadershipZone(doc)
    expect(zone).not.toBeNull()
    expect(zone!.startOffset).toBe(headingStart)
    expect(zone!.endOffset).toBe(nextHeading)
    expect(zoneForOffset(zone, text.indexOf('climate'))).toBe('leadership')
  })

  it('manual override wins over heading derivation, and clearing restores it', async () => {
    t = createTestDb()
    setDbDriver(t.driver)
    const text = "Vice-Chancellor's introduction\n\nDetected zone content.\n\nOperations\n\nBody content."
    const doc = t.document({ extractedText: text })

    // The human marks a DIFFERENT range than detection would find.
    const override = { startOffset: 0, endOffset: text.indexOf('Detected') + 20 }
    await setZoneOverride(doc, override)

    const zone = await getLeadershipZone(doc)
    expect(zone).not.toBeNull()
    expect(zone!.headingText).toBe('Manual override')
    expect(zone!.startOffset).toBe(override.startOffset)
    expect(zone!.endOffset).toBe(override.endOffset)

    // Clearing the override lets derivation answer again (null here —
    // no headings were ever stored).
    await setZoneOverride(doc, null)
    expect(await getLeadershipZone(doc)).toBeNull()
  })
})
