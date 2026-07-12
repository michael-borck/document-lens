import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, type TestDb } from './_shared/test-db'
import { setDbDriver, resetDbDriver } from './db'
import {
  listDocumentImages,
  getDocumentImage,
  countImagesByDocuments,
  replaceDocumentImages,
} from './document-images'
import type { ExtractedImage } from './api'

function extracted(overrides: Partial<ExtractedImage> = {}): ExtractedImage {
  return {
    page_number: 3,
    image_index: 0,
    name: 'Im1',
    width: 600,
    height: 400,
    format: 'jpeg',
    hash_sha256: `hash-${overrides.image_index ?? 0}`,
    thumbnail_base64: 'dGh1bWI=',
    thumbnail_mime: 'image/jpeg',
    image_base64: 'ZnVsbA==',
    image_mime: 'image/jpeg',
    ...overrides,
  }
}

describe('document-images service', () => {
  let t: TestDb
  let docId: string

  beforeEach(() => {
    t = createTestDb()
    setDbDriver(t.driver)
    docId = t.document()
  })

  afterEach(() => {
    t.close()
    resetDbDriver()
  })

  it('stores extracted images and lists them without the display rendition', async () => {
    await replaceDocumentImages(docId, [
      extracted({ image_index: 0, page_number: 1 }),
      extracted({ image_index: 1, page_number: 4 }),
    ])

    const images = await listDocumentImages(docId)
    expect(images).toHaveLength(2)
    expect(images.map((i) => i.pageNumber)).toEqual([1, 4])
    expect(images[0].thumbnailData).toBe('data:image/jpeg;base64,dGh1bWI=')
    // The list query deliberately omits the heavy display rendition.
    expect(images[0].imageData).toBeNull()
  })

  it('getDocumentImage returns the display rendition', async () => {
    await replaceDocumentImages(docId, [extracted()])
    const [listed] = await listDocumentImages(docId)

    const full = await getDocumentImage(listed.id)
    expect(full?.imageData).toBe('data:image/jpeg;base64,ZnVsbA==')
    expect(full?.imageHash).toBe('hash-0')
  })

  it('null page_number round-trips (DOCX images have no page)', async () => {
    await replaceDocumentImages(docId, [extracted({ page_number: null })])

    const [img] = await listDocumentImages(docId)
    expect(img.pageNumber).toBeNull()
  })

  it('replaceDocumentImages replaces rather than appends', async () => {
    await replaceDocumentImages(docId, [
      extracted({ image_index: 0 }),
      extracted({ image_index: 1 }),
    ])
    await replaceDocumentImages(docId, [extracted({ image_index: 0, hash_sha256: 'fresh' })])

    const images = await listDocumentImages(docId)
    expect(images).toHaveLength(1)
    expect(images[0].imageHash).toBe('fresh')
  })

  it('replaceDocumentImages with an empty result clears stored images', async () => {
    await replaceDocumentImages(docId, [extracted()])
    await replaceDocumentImages(docId, [])

    expect(await listDocumentImages(docId)).toHaveLength(0)
  })

  it('counts images per document, omitting documents with none', async () => {
    const other = t.document()
    await replaceDocumentImages(docId, [
      extracted({ image_index: 0 }),
      extracted({ image_index: 1 }),
    ])

    const counts = await countImagesByDocuments([docId, other])
    expect(counts.get(docId)).toBe(2)
    expect(counts.has(other)).toBe(false)
    expect((await countImagesByDocuments([])).size).toBe(0)
  })

  it('images cascade-delete with their document', async () => {
    await replaceDocumentImages(docId, [extracted()])
    t.db.prepare('DELETE FROM documents WHERE id = ?').run(docId)

    expect(await listDocumentImages(docId)).toHaveLength(0)
  })
})
