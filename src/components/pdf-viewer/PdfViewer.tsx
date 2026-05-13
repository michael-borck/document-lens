/**
 * Embedded PDF viewer (US-G-04) — iframe + Chromium's native PDF viewer.
 *
 * Originally tried pdfjs-dist for programmatic highlight, but it kept
 * breaking on Electron 33's older Chromium (missing Uint8Array.toHex
 * etc. in the worker context). Native PDFium renders perfectly, costs
 * zero bundle weight, and supports `#page=N` for jump-to-page.
 *
 * Trade-off: no programmatic keyword highlight. The MatchCard already
 * gives the user a "Copy phrase" button that pre-builds a 3-word
 * search string; inside the embedded viewer they hit Cmd-F, paste,
 * and land on the keyword. Same end state, far less fragility.
 *
 * File loading: read bytes via the existing preload's fs:readFile,
 * wrap as a Blob, mint a blob: URL, point the iframe at it. No
 * protocol handler, no webSecurity changes — blob URLs are renderer-
 * scoped and Chromium's PDF viewer accepts them.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileWarning, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PdfViewerProps {
  filePath: string
  initialPage?: number
  /** Kept for prop-shape compatibility with the modal; not honoured —
   *  Chromium's PDF viewer doesn't expose a highlight API. The modal
   *  description copy points the user at Cmd-F + Copy phrase. */
  highlight?: string
}

export function PdfViewer({ filePath, initialPage = 1 }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Load file bytes once per filePath. Wraps as a blob: URL so the
  // iframe can render via Chromium's built-in PDFium viewer without
  // a custom protocol or webSecurity tweak.
  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setError(null)
    setBlobUrl(null)

    async function load() {
      try {
        const electron = window.electron
        if (!electron) throw new Error('Electron bridge unavailable')
        const buffer = await electron.readFile(filePath)
        if (cancelled) return
        const blob = new Blob([buffer], { type: 'application/pdf' })
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    load()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [filePath])

  const openExternally = () => {
    window.electron?.openPath(filePath).catch(() => {
      /* user cancelled or system rejected */
    })
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <FileWarning className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm">
          <div className="font-medium">Couldn't load PDF</div>
          <div className="text-muted-foreground text-xs mt-1">{error}</div>
        </div>
        <Button variant="outline" size="sm" onClick={openExternally} className="gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" />
          Open in external viewer
        </Button>
      </div>
    )
  }

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading PDF…
      </div>
    )
  }

  // `#page=N` is the standard PDF Open Parameter — Chromium's PDFium
  // viewer honours it on blob: URLs the same as on file:// URLs.
  return (
    <iframe
      ref={iframeRef}
      src={`${blobUrl}#page=${initialPage}`}
      className="w-full h-full border-0"
      title="PDF preview"
    />
  )
}
