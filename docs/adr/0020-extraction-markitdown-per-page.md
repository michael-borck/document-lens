# ADR-0020: Extraction — markitdown for DOCX/text, pdfplumber+pypdf for PDF, per-page storage

**Status:** Accepted
**Date:** 2026-04-27 (extraction), 2026-05-12 (per-page storage)
**Evidence:** `8e42206` / `c4129ef` (markitdown swap), `127d700` (per-page text storage); `information-architecture.md:791-797` (IA-8); backend `document_processor`

## Context

Extraction spanned many formats (PDF, DOCX, PPTX, TXT, MD) with per-format
parsers. But PDF specifically needs **per-page** text so the research features
(page-numbered concordance, an in-app PDF viewer with `#page=N`) can cite by page
— and the app should not have to re-import a corpus later when those ship.

## Decision

- Use **`markitdown[docx,pptx,xlsx]`** as the unified converter for
  DOCX/PPTX/text formats.
- **Deliberately keep the PDF path on `pdfplumber` + `pypdf`** to preserve
  **per-page extraction** (markitdown flattens pages).
- **Store per-page text (`document_pages`) at import time** even before any UI
  consumes it, so the Read concordance and PDF viewer can be added later without
  re-importing (IA-8).

## Alternatives considered

- **markitdown for PDF too** — rejected: loses page boundaries needed for
  citation.
- **Store only full text, add per-page later** — rejected: would force a
  corpus-wide re-import when the page-aware features ship.

## Consequences

- One converter for the common formats; PDF keeps page fidelity.
- A small storage cost up front (per-page rows) that de-risks later features.
