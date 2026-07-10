# ADR-0021: Embedded PDF viewer — iframe + Chromium's native PDFium (drop pdfjs-dist)

**Status:** Accepted
**Date:** 2026-05-13
**Evidence:** `9f71577` (initial pdfjs-dist viewer), `46feeb8` "swap pdfjs-dist for iframe + Chromium native PDFium"; `src/components/pdf-viewer/`

## Context

The in-app PDF viewer (US-G-04) first used `pdfjs-dist` v5, which called
bleeding-edge browser APIs (e.g. `Uint8Array.toHex`) missing from the Electron
Chromium build — an endless polyfill cat-and-mouse, plus a heavy worker bundle.

## Decision

Render the PDF by loading a renderer-scoped **`blob:` URL into an `<iframe>`**,
displayed by **Chromium's built-in PDFium**. It honours `#page=N` (deep-link to a
match's page) and exposes native Cmd-F search. The trade-off is **explicitly
accepted**: lose programmatic keyword-highlighting, gain a ~2 KB integration
(vs ~450 KB pdfjs), no worker, no version fragility.

## Alternatives considered

- **pdfjs-dist** — rejected: constant polyfilling against Electron's Chromium and
  a large bundle, for a feature that mainly needs "show the page and let me
  search".

## Consequences

- Robust, tiny, and future-proof against Chromium changes.
- No in-viewer highlight; matches are found via the page-numbered concordance
  (US-G-03) and native Cmd-F. DOCX/PPTX fall back to the concordance.
