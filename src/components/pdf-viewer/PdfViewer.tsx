/**
 * Embedded PDF viewer body (US-G-04).
 *
 * Renders one page at a time to a canvas, overlays a text layer for
 * selection + keyword highlight, and exposes prev/next + page-jump
 * controls. Loads the PDF bytes via the Electron preload's
 * fs:readFile so we don't have to deal with file:// URL scheme
 * permissions.
 *
 * Lazy-loaded: pdfjs-dist only enters the bundle when a parent calls
 * import('./PdfViewer'). Worker loaded via Vite's ?url import so the
 * worker file ends up in dist/assets and is referenced by URL — no
 * fetch failures from CSP or file://.
 */

import { useEffect, useRef, useState } from 'react'
// Polyfills MUST run before pdfjs-dist is imported — pdfjs v5 calls
// Uint8Array.prototype.toHex() during PDF parsing, a method added in
// Chromium 137. Electron 33 ships Chromium 130, so we shim it.
import './uint8-polyfill'
import { GlobalWorkerOptions, getDocument, TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// Worker file shipped by pdfjs-dist; Vite's `?url` resolves it to a
// stable URL the worker can be loaded from at runtime.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './pdf-viewer.css'

GlobalWorkerOptions.workerSrc = workerSrc

interface PdfViewerProps {
  filePath: string
  initialPage?: number
  highlight?: string
}

export function PdfViewer({ filePath, initialPage = 1, highlight }: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(initialPage)
  const [scale, setScale] = useState<number>(1.25)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pageJumpDraft, setPageJumpDraft] = useState<string>(String(initialPage))

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Token to cancel a stale page render if the user pages quickly.
  const renderTokenRef = useRef<number>(0)

  // Load PDF bytes once per filePath.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPdf(null)

    async function load() {
      try {
        const electron = window.electron
        if (!electron) throw new Error('Electron bridge unavailable')
        const buffer = await electron.readFile(filePath)
        const bytes = new Uint8Array(buffer)
        const loadingTask = getDocument({ data: bytes })
        const doc = await loadingTask.promise
        if (cancelled) {
          doc.destroy()
          return
        }
        setPdf(doc)
        setNumPages(doc.numPages)
        const startPage = Math.min(Math.max(1, initialPage), doc.numPages)
        setCurrentPage(startPage)
        setPageJumpDraft(String(startPage))
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [filePath, initialPage])

  // Render current page (canvas + text layer) whenever pdf / page / scale changes.
  useEffect(() => {
    if (!pdf || currentPage < 1 || currentPage > numPages) return
    const token = ++renderTokenRef.current

    async function render() {
      const page = await pdf!.getPage(currentPage)
      if (token !== renderTokenRef.current) return
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      const textLayer = textLayerRef.current
      if (!canvas || !textLayer) return

      // Use device pixel ratio for crisp rendering on hi-dpi screens.
      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      })
      try {
        await renderTask.promise
      } catch (err) {
        // RenderingCancelledException is thrown when we cancel a stale
        // render — safe to ignore.
        if ((err as { name?: string }).name === 'RenderingCancelledException') return
        throw err
      }

      if (token !== renderTokenRef.current) return

      // Render the text layer (positioned divs) over the canvas so the
      // user can select + we can highlight matches.
      textLayer.innerHTML = ''
      textLayer.style.setProperty('--total-scale-factor', String(scale))
      textLayer.style.width = `${viewport.width}px`
      textLayer.style.height = `${viewport.height}px`
      const textContent = await page.getTextContent()
      if (token !== renderTokenRef.current) return

      const layer = new TextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport,
      })
      await layer.render()

      if (token !== renderTokenRef.current) return
      applyHighlight(textLayer, highlight)
    }

    render().catch((err) => {
      if ((err as { name?: string }).name === 'RenderingCancelledException') return
      console.error('[pdf-viewer] render failed', err)
    })
  }, [pdf, currentPage, numPages, scale, highlight])

  const goPrev = () => {
    if (currentPage > 1) {
      const next = currentPage - 1
      setCurrentPage(next)
      setPageJumpDraft(String(next))
    }
  }
  const goNext = () => {
    if (currentPage < numPages) {
      const next = currentPage + 1
      setCurrentPage(next)
      setPageJumpDraft(String(next))
    }
  }
  const commitJump = () => {
    const n = Number(pageJumpDraft)
    if (Number.isFinite(n) && n >= 1 && n <= numPages) {
      setCurrentPage(Math.floor(n))
    } else {
      setPageJumpDraft(String(currentPage))  // revert
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        pageJumpDraft={pageJumpDraft}
        loading={loading}
        onPrev={goPrev}
        onNext={goNext}
        onPageJumpChange={setPageJumpDraft}
        onCommitJump={commitJump}
        onZoomIn={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))}
        onZoomOut={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
      />

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/40 flex items-start justify-center p-6"
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading PDF…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive border border-destructive/30 rounded-md p-4 max-w-md">
            Couldn't load PDF: {error}
          </div>
        ) : (
          <div className="relative shadow-md bg-white">
            <canvas ref={canvasRef} className="block" />
            <div
              ref={textLayerRef}
              className="textLayer absolute inset-0 overflow-hidden"
              aria-hidden
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Toolbar({
  currentPage,
  numPages,
  scale,
  pageJumpDraft,
  loading,
  onPrev,
  onNext,
  onPageJumpChange,
  onCommitJump,
  onZoomIn,
  onZoomOut,
}: {
  currentPage: number
  numPages: number
  scale: number
  pageJumpDraft: string
  loading: boolean
  onPrev: () => void
  onNext: () => void
  onPageJumpChange: (v: string) => void
  onCommitJump: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={loading || currentPage <= 1}
        className="h-8 w-8 p-0"
        title="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={loading || currentPage >= numPages}
        className="h-8 w-8 p-0"
        title="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-1.5 text-xs">
        <Input
          type="text"
          value={pageJumpDraft}
          onChange={(e) => onPageJumpChange(e.target.value)}
          onBlur={onCommitJump}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitJump()
          }}
          disabled={loading}
          className="h-8 w-14 text-center tabular-nums"
        />
        <span className="text-muted-foreground tabular-nums">
          / {numPages || '—'}
        </span>
      </div>

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        onClick={onZoomOut}
        disabled={loading || scale <= 0.5}
        className="h-8 w-8 p-0"
        title="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-center">
        {Math.round(scale * 100)}%
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomIn}
        disabled={loading || scale >= 3}
        className="h-8 w-8 p-0"
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Walk the rendered text-layer spans and wrap any keyword matches in a
 * <mark> highlight. Naive (won't handle a keyword that crosses span
 * boundaries — pdfjs sometimes splits a word across spans during
 * rendering), but good enough for whole-word matches in body text.
 * For phrases that span boundaries the user can still page+find via
 * Cmd-F in the modal.
 */
function applyHighlight(textLayer: HTMLDivElement, keyword: string | undefined): void {
  if (!keyword) return
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const isPhrase = /\s/.test(keyword)
  const re = isPhrase
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')

  // Each text-content item becomes a span with role="presentation".
  const spans = textLayer.querySelectorAll<HTMLSpanElement>('span')
  for (const span of spans) {
    const text = span.textContent ?? ''
    if (!re.test(text)) {
      re.lastIndex = 0
      continue
    }
    re.lastIndex = 0
    // Replace the span's content with a highlighted version. We rebuild
    // child nodes so other text-layer behavior (selection geometry
    // computed from glyph positions) still works.
    const frag = document.createDocumentFragment()
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)))
      }
      const mark = document.createElement('mark')
      mark.className = 'pdf-highlight'
      mark.textContent = m[0]
      frag.appendChild(mark)
      last = m.index + m[0].length
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)))
    }
    span.innerHTML = ''
    span.appendChild(frag)
    re.lastIndex = 0
  }
}
