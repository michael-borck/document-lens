/**
 * Image gallery for one document (ADR-0027 phase 1).
 *
 * Grid of thumbnails (extracted at import, deduplicated, tiny decorative
 * images filtered) → click for the display rendition plus metadata and a
 * jump-to-page into the embedded PDF viewer. The stored display rendition
 * is capped (~1600px); the source document remains the full-resolution
 * original.
 */

import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PdfViewerModal } from '@/components/pdf-viewer/PdfViewerModal'
import { listDocumentImages, getDocumentImage } from '@/services/document-images'
import { isSourceMissing } from '@/services/documents'
import type { Document, DocumentImage } from '@/types/data'

interface ImageGalleryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: Document
}

export function ImageGalleryModal({ open, onOpenChange, document: doc }: ImageGalleryModalProps) {
  const [images, setImages] = useState<DocumentImage[] | null>(null)
  const [selected, setSelected] = useState<DocumentImage | null>(null)
  const [pdfPage, setPdfPage] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setImages(null)
    setSelected(null)
    listDocumentImages(doc.id).then((result) => {
      if (!cancelled) setImages(result)
    })
    return () => {
      cancelled = true
    }
  }, [open, doc.id])

  const openImage = async (img: DocumentImage) => {
    // Show the thumbnail immediately, swap in the display rendition when loaded.
    setSelected(img)
    const full = await getDocumentImage(img.id)
    if (full) setSelected((cur) => (cur?.id === full.id ? full : cur))
  }

  const label = doc.title ?? doc.filename
  const isPdf = /\.pdf$/i.test(doc.filename)
  const canJumpToPage =
    isPdf && !isSourceMissing(doc) && selected?.pageNumber != null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-[1100px] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="text-base font-medium truncate">
              {selected ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Back to gallery"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  Image {selected.imageIndex + 1}
                  {selected.pageNumber != null && ` · page ${selected.pageNumber}`}
                </span>
              ) : (
                <>Images · {label}</>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selected
                ? [
                    selected.width && selected.height ? `${selected.width} × ${selected.height}px` : null,
                    selected.format ? selected.format.toUpperCase() : null,
                    'display copy — open the source document for full resolution',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Extracted at import. Repeated images (logos) are collapsed; tiny decorative ones are skipped.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4">
            {images === null ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading images…
              </div>
            ) : selected ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={selected.imageData ?? selected.thumbnailData}
                  alt={`Image ${selected.imageIndex + 1} from ${label}`}
                  className="max-w-full max-h-[60vh] object-contain rounded border border-border bg-muted/20"
                />
                {canJumpToPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setPdfPage(selected.pageNumber)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open PDF at page {selected.pageNumber}
                  </Button>
                )}
                {(selected.captionText || selected.ocrText || selected.aiDescription) && (
                  <div className="w-full max-w-2xl text-sm space-y-2">
                    {selected.captionText && (
                      <p><span className="font-medium">Caption:</span> {selected.captionText}</p>
                    )}
                    {selected.ocrText && (
                      <p><span className="font-medium">Text in image:</span> {selected.ocrText}</p>
                    )}
                    {selected.aiDescription && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">AI description ({selected.aiProvider ?? 'unknown'}):</span>{' '}
                        {selected.aiDescription}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <ImageOff className="h-8 w-8" />
                <p className="text-sm">No images were found in this document.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => void openImage(img)}
                    className="group relative rounded border border-border overflow-hidden bg-muted/20 hover:border-foreground/40 transition-colors aspect-square"
                    title={
                      img.pageNumber != null
                        ? `Page ${img.pageNumber} · ${img.width ?? '?'} × ${img.height ?? '?'}px`
                        : `${img.width ?? '?'} × ${img.height ?? '?'}px`
                    }
                  >
                    <img
                      src={img.thumbnailData}
                      alt={`Image ${img.imageIndex + 1}`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                    {img.pageNumber != null && (
                      <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-background/85 border border-border text-muted-foreground">
                        p. {img.pageNumber}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {pdfPage != null && (
        <PdfViewerModal
          open={pdfPage != null}
          onOpenChange={(o) => { if (!o) setPdfPage(null) }}
          filePath={doc.filePath}
          documentLabel={label}
          initialPage={pdfPage}
        />
      )}
    </>
  )
}
