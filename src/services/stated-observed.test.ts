import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver, runBatch } from './db'
import { replaceDocumentHeadingsOps } from './document-headings'
import { computeStatedObserved } from './stated-observed'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

const HEADING_VC = "Vice-Chancellor's introduction"
const P_LEADERSHIP = 'Our net zero commitment and our zero carbon target anchor the strategy.'
const HEADING_OPS = 'Operations'
const P_BODY = 'The plant burned coal and oil all year, with diesel backups and LNG peaking.'
const TEXT = `${HEADING_VC}\n\n${P_LEADERSHIP}\n\n${HEADING_OPS}\n\n${P_BODY}`
const OPS_OFFSET = TEXT.indexOf(HEADING_OPS)

function seedDoc(extractedText: string = TEXT) {
  t = createTestDb()
  setDbDriver(t.driver)
  const pid = t.project()
  const list = t.keywordList()
  t.projectKeywordList(pid, list)
  for (const [text, polarity] of [
    ['net zero', 'positive'],
    ['zero carbon', 'positive'],
    ['coal', 'counter'],
    ['oil', 'counter'],
    ['diesel', 'counter'],
    ['LNG', 'counter'],
  ] as const) {
    t.keyword(list, text, polarity)
  }
  const doc = t.document({ extractedText, company: 'Test University', year: 2025 })
  t.addDocToProject(pid, doc)
  return { pid, list, doc }
}

function seedZone(doc: string) {
  return runBatch(
    replaceDocumentHeadingsOps(doc, [
      { pageNumber: 1, text: HEADING_VC, fontSize: 18, bold: true, startOffset: 0, endOffset: HEADING_VC.length },
      { pageNumber: 1, text: HEADING_OPS, fontSize: 16, bold: true, startOffset: OPS_OFFSET, endOffset: OPS_OFFSET + HEADING_OPS.length },
    ])
  )
}

describe('computeStatedObserved', () => {
  it('resolves divergent bands to the say-do gap', async () => {
    const s = seedDoc()
    await seedZone(s.doc)

    const result = await computeStatedObserved({ projectId: s.pid, keywordListId: s.list })
    const [row] = result.documents
    expect(row.zoneDetected).toBe(true)
    // Stated lives in leadership; observed lives in body.
    expect(row.statedLeadership).toBeGreaterThan(0)
    expect(row.statedBody).toBe(0)
    expect(row.observedBody).toBeGreaterThan(0)
    expect(row.observedLeadership).toBe(0)
    expect(row.outcome).toBe('divergent')
  })

  it('flags co-located stated and observed for human reading', async () => {
    const s = seedDoc()
    // Move the counter terms INSIDE the leadership zone (before the
    // Operations heading), and quiet the body down.
    const text = TEXT.replace(
      P_LEADERSHIP,
      'Our net zero commitment anchors the strategy, yet coal and oil shipments grew and a diesel plant opened on the edge of campus.'
    ).replace(P_BODY, 'The year closed with routine maintenance and audits.')
    t.db.prepare('UPDATE documents SET extracted_text = ? WHERE id = ?').run(text, s.doc)
    // Zone offsets must come from the STORED text — the replacement shifts
    // the Operations heading.
    const ops = text.indexOf(HEADING_OPS)
    await runBatch(
      replaceDocumentHeadingsOps(s.doc, [
        { pageNumber: 1, text: HEADING_VC, fontSize: 18, bold: true, startOffset: 0, endOffset: HEADING_VC.length },
        { pageNumber: 1, text: HEADING_OPS, fontSize: 16, bold: true, startOffset: ops, endOffset: ops + HEADING_OPS.length },
      ])
    )

    const result = await computeStatedObserved({ projectId: s.pid, keywordListId: s.list })
    const [row] = result.documents
    expect(row.statedLeadership).toBeGreaterThan(0)
    expect(row.observedLeadership).toBeGreaterThan(0)
    expect(row.observedBody).toBe(0)
    expect(row.outcome).toBe('co-located')
  })

  it('reports no-countervailing when only avowal exists', async () => {
    const s = seedDoc(
      `${HEADING_VC}\n\nOur net zero commitment anchors the strategy.\n\n${HEADING_OPS}\n\nQuiet year.`
    )
    await seedZone(s.doc)

    const result = await computeStatedObserved({ projectId: s.pid, keywordListId: s.list })
    const [row] = result.documents
    expect(row.observedLeadership + row.observedBody).toBe(0)
    expect(row.outcome).toBe('no-countervailing')
  })

  it('reports no-stated when only transgression language exists', async () => {
    const s = seedDoc(`${HEADING_VC}\n\nIntro words.\n\n${HEADING_OPS}\n\n${P_BODY}`)
    await seedZone(s.doc)

    const result = await computeStatedObserved({ projectId: s.pid, keywordListId: s.list })
    expect(result.documents[0].outcome).toBe('no-stated')
  })

  it('is undetermined without a detected zone (all-Body fallback makes bands meaningless)', async () => {
    const s = seedDoc() // no headings seeded
    const result = await computeStatedObserved({ projectId: s.pid, keywordListId: s.list })
    const [row] = result.documents
    expect(row.zoneDetected).toBe(false)
    expect(row.outcome).toBe('undetermined')
  })
})
