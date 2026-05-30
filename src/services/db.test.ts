import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import {
  selectAll,
  selectOne,
  runStatement,
  runBatch,
  updateRow,
  selectInList,
  setDbDriver,
  resetDbDriver,
} from './db'

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

function withDb(): TestDb {
  t = createTestDb()
  setDbDriver(t.driver)
  return t
}

describe('db driver seam (in-memory adapter)', () => {
  it('runs registered SELECTs against the real registry', async () => {
    const db = withDb()
    const pid = db.project()
    const d1 = db.document()
    const d2 = db.document()
    db.addDocToProject(pid, d1)
    db.addDocToProject(pid, d2)

    const rows = await selectAll<{ id: string }>('documents.byProject', [pid])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.id).sort()).toEqual([d1, d2].sort())
  })

  it('selectOne returns the first row or null', async () => {
    const db = withDb()
    const d = db.document({ title: 'Solo' })
    const row = await selectOne<{ title: string }>('documents.getById', [d])
    expect(row?.title).toBe('Solo')
    expect(await selectOne('documents.getById', ['missing'])).toBeNull()
  })

  it('runStatement reports changes', async () => {
    const db = withDb()
    const pid = db.project()
    const res = await runStatement('projects.touch', ['2025-01-01T00:00:00.000Z', pid])
    expect(res.changes).toBe(1)
  })

  it('expands __IN__ lists for selectInList', async () => {
    const db = withDb()
    const list = db.keywordList()
    const kw = db.keyword(list, 'energy')
    db.synonym(kw, 'power', true)
    db.synonym(kw, 'fuel', false) // disabled — excluded by enabledByKeywordIds

    const all = await selectInList<{ text: string }>('synonyms.byKeywordIds', [kw])
    expect(all.map((r) => r.text).sort()).toEqual(['fuel', 'power'])

    const enabled = await selectInList<{ text: string }>('synonyms.enabledByKeywordIds', [kw])
    expect(enabled.map((r) => r.text)).toEqual(['power'])
  })

  it('runBatch commits every op atomically', async () => {
    const db = withDb()
    const pid = db.project()
    const d1 = db.document()
    const d2 = db.document()
    await runBatch([
      { key: 'projects.addDocument', params: [pid, d1, '2025-01-01T00:00:00.000Z'] },
      { key: 'projects.addDocument', params: [pid, d2, '2025-01-01T00:00:00.000Z'] },
    ])
    const rows = await selectAll<{ id: string }>('documents.byProject', [pid])
    expect(rows).toHaveLength(2)
  })

  it('runBatch rolls back every op when one fails', async () => {
    const db = withDb()
    const pid = db.project()
    const d1 = db.document()
    // Second op references a non-existent document_id → FK violation, so the
    // whole batch (including the valid first insert) must roll back.
    await expect(
      runBatch([
        { key: 'projects.addDocument', params: [pid, d1, '2025-01-01T00:00:00.000Z'] },
        { key: 'projects.addDocument', params: [pid, 'no-such-doc', '2025-01-01T00:00:00.000Z'] },
      ])
    ).rejects.toThrow()
    const rows = await selectAll<{ id: string }>('documents.byProject', [pid])
    expect(rows).toHaveLength(0)
  })

  it('honours the dynamic-update column allowlist', async () => {
    const db = withDb()
    const d = db.document({ title: 'Old' })

    const ok = await updateRow('documents', ['title'], 'id', ['New', d])
    expect(ok.changes).toBe(1)
    expect((await selectOne<{ title: string }>('documents.getById', [d]))?.title).toBe('New')

    // extracted_text is not in the documents allowlist — must be rejected.
    await expect(
      updateRow('documents', ['extracted_text'], 'id', ['x', d])
    ).rejects.toThrow(/not updatable/)
  })
})
