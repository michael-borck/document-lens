/**
 * Document images — embedded images extracted from a document at import
 * time (ADR-0027). The backend finds and returns images (with page
 * anchors, deduplicated by content hash, tiny decorative images
 * filtered); this service persists them and serves the gallery.
 *
 * List queries omit the display rendition (`imageData`) — it can be
 * hundreds of KB per image — so the gallery grid loads thumbnails only
 * and fetches the display rendition per image on click.
 */

import { selectAll, selectOne, selectInList, runBatch, runStatement, newId, now, type BatchOp } from './db'
import type { DocumentImage } from '@/types/data'
import type { ExtractedImage } from './api'

interface DocumentImageRow {
  id: string
  document_id: string
  page_number: number | null
  image_index: number
  width: number | null
  height: number | null
  format: string | null
  image_hash: string
  thumbnail_data: string
  image_data?: string
  ocr_text: string | null
  caption_text: string | null
  ai_description: string | null
  ai_provider: string | null
  extracted_at: string
}

function rowToDocumentImage(row: DocumentImageRow): DocumentImage {
  return {
    id: row.id,
    documentId: row.document_id,
    pageNumber: row.page_number,
    imageIndex: row.image_index,
    width: row.width,
    height: row.height,
    format: row.format,
    imageHash: row.image_hash,
    thumbnailData: row.thumbnail_data,
    imageData: row.image_data ?? null,
    ocrText: row.ocr_text,
    captionText: row.caption_text,
    aiDescription: row.ai_description,
    aiProvider: row.ai_provider,
    extractedAt: row.extracted_at,
  }
}

/** All images for a document, thumbnails only (imageData is null). */
export async function listDocumentImages(documentId: string): Promise<DocumentImage[]> {
  const rows = await selectAll<DocumentImageRow>('documentImages.listByDocument', [documentId])
  return rows.map(rowToDocumentImage)
}

/** One image including its display rendition. */
export async function getDocumentImage(id: string): Promise<DocumentImage | null> {
  const row = await selectOne<DocumentImageRow>('documentImages.getById', [id])
  return row ? rowToDocumentImage(row) : null
}

/** Image counts per document, for Library row badges. Missing id => 0 images. */
export async function countImagesByDocuments(
  documentIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (documentIds.length === 0) return counts
  const rows = await selectInList<{ document_id: string; n: number }>(
    'documentImages.countsByDocuments',
    documentIds
  )
  for (const row of rows) counts.set(row.document_id, row.n)
  return counts
}

/**
 * Build the batch ops that replace a document's images with a fresh
 * extraction result. Exposed as ops (rather than executing here) so the
 * import pipeline can commit them; failures there must not fail the
 * document import itself.
 */
export function buildReplaceImagesOps(
  documentId: string,
  images: ExtractedImage[]
): BatchOp[] {
  const ops: BatchOp[] = [
    { key: 'documentImages.deleteByDocument', params: [documentId] },
  ]
  const extractedAt = now()
  for (const img of images) {
    ops.push({
      key: 'documentImages.insert',
      params: [
        newId(),
        documentId,
        img.page_number,
        img.image_index,
        img.width,
        img.height,
        img.format,
        img.hash_sha256,
        `data:${img.thumbnail_mime};base64,${img.thumbnail_base64}`,
        `data:${img.image_mime};base64,${img.image_base64}`,
        extractedAt,
      ],
    })
  }
  return ops
}

/** Replace a document's stored images atomically. */
export async function replaceDocumentImages(
  documentId: string,
  images: ExtractedImage[]
): Promise<void> {
  if (images.length === 0) {
    await runStatement('documentImages.deleteByDocument', [documentId])
    return
  }
  await runBatch(buildReplaceImagesOps(documentId, images))
}
