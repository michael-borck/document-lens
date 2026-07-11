import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import { listDocuments, updateDocumentAttributes } from './documents'

// Backs US-X-15 (multi-select bulk edit). The Library's bulk editor applies one
// attribute change to every selected document by calling
// updateDocumentAttributes per id; this asserts that path writes only the
// targeted column on only the targeted rows, and leaves everything else intact.

let t: TestDb

afterEach(() => {
  t?.close()
  resetDbDriver()
})

function seedThree(): { a: string; b: string; c: string } {
  t = createTestDb()
  setDbDriver(t.driver)
  const a = t.document({ filename: 'a.pdf', title: 'A', company: 'Acme', year: 2020 })
  const b = t.document({ filename: 'b.pdf', title: 'B', company: 'Beta', year: 2021 })
  const c = t.document({ filename: 'c.pdf', title: 'C', company: 'Gamma', year: 2022 })
  return { a, b, c }
}

async function byId(id: string) {
  return (await listDocuments()).find((d) => d.id === id)!
}

describe('bulk edit via updateDocumentAttributes', () => {
  it('applies one field to a subset and leaves the rest untouched', async () => {
    const { a, b, c } = seedThree()
    // Bulk-set type on A and B only.
    for (const id of [a, b]) await updateDocumentAttributes(id, { type: 'Annual Report' })

    expect((await byId(a)).type).toBe('Annual Report')
    expect((await byId(b)).type).toBe('Annual Report')
    expect((await byId(c)).type).toBeNull() // not selected — unchanged
  })

  it('only writes the patched column, preserving other attributes', async () => {
    const { a } = seedThree()
    await updateDocumentAttributes(a, { sector: 'Energy' })
    const doc = await byId(a)
    expect(doc.sector).toBe('Energy')
    // Untouched columns survive.
    expect(doc.company).toBe('Acme')
    expect(doc.year).toBe(2020)
    expect(doc.title).toBe('A')
  })

  it('maps companySize to the company_size column', async () => {
    const { a } = seedThree()
    await updateDocumentAttributes(a, { companySize: 'Large' })
    expect((await byId(a)).companySize).toBe('Large')
  })

  it('can clear a field by setting it to null', async () => {
    const { a } = seedThree()
    await updateDocumentAttributes(a, { year: null })
    expect((await byId(a)).year).toBeNull()
  })

  it('is a no-op when the patch is empty', async () => {
    const { a } = seedThree()
    const before = await byId(a)
    await updateDocumentAttributes(a, {})
    expect(await byId(a)).toEqual(before)
  })
})
