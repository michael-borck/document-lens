/**
 * Embedded PDF viewer modal (US-G-04).
 *
 * Lazy-imported so pdfjs-dist (~300 KB) only ships when the user
 * actually opens a preview. The inner PdfViewer is dynamically
 * imported via React.lazy.
 */

import { Suspense, lazy } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const PdfViewer = lazy(() => import('./PdfViewer').then((m) => ({ default: m.PdfViewer })))

interface PdfViewerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filePath: string
  documentLabel: string
  /** 1-based page to start on. Defaults to 1. */
  initialPage?: number
  /** Keyword to highlight on the visible page (case-insensitive). */
  highlight?: string
}

export function PdfViewerModal({
  open,
  onOpenChange,
  filePath,
  documentLabel,
  initialPage,
  highlight,
}: PdfViewerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-medium truncate">
            {documentLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {highlight
              ? <>Previewing source. Hit <kbd className="bg-muted px-1 rounded text-[10px]">⌘F</kbd> inside the PDF and paste <code className="bg-muted px-1 rounded">{highlight}</code> (or use the <strong>Copy phrase</strong> button on the match card) to land on the keyword.</>
              : 'Previewing source.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {open && (
            <Suspense fallback={<Loading />}>
              <PdfViewer
                filePath={filePath}
                initialPage={initialPage}
                highlight={highlight}
              />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading PDF viewer…
    </div>
  )
}
