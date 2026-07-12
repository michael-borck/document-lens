# ADR-0027: Images as text: backend extracts, app orchestrates, image-analyser stays image-only

**Status:** Proposed
**Date:** 2026-07-12
**Evidence:** `document_analyser/extraction.py`, `document_analyser/services/document_processor.py` (text-only today); `image-analyser` v0.6.0 `src/image_analyser/image_analyser.py` (accepts only image inputs); `src/services/substance.ts`, `src/services/_shared/project-corpus.ts`; ADR-0007, ADR-0011, ADR-0014, ADR-0020

## Context

The analysis pipeline is text-only: `extract_text` (pdfplumber/pypdf) drops
every image in a PDF, and DOCX goes through markitdown, which also discards
images. Annual and strategy reports put load-bearing content in figures —
infographic targets, chart labels, photo captions — so a document can *show*
commitments the tool never counts. We want to (a) surface a document's images
to the researcher (gallery, thumbnails, jump-to-page in the PDF viewer),
(b) turn image content into text, and (c) optionally include that text in the
existing keyword/signal analysis.

Three family members could plausibly own image extraction from documents:
`image-analyser` (teach it PDFs/DOCX), `document-analyser` (already owns
format parsing), or a new dedicated extraction tool. And the family's
cross-cutting principle constrains (c): every computed signal is
deterministic and reproducible; generative AI is an opt-in, always-flagged
interpretation layer, never used to compute a signal (ADR-0007/0011/0014).

## Decision

**1. Extraction ownership.** `document-analyser` gains image *extraction*:
for each embedded image it returns the bytes plus locating metadata — page
number (PDF) or paragraph/anchor index (DOCX), index-on-page, dimensions,
bbox where available, and a content hash — via a new endpoint alongside the
per-page text extraction. It **finds and returns** images; it does not
analyse them. `image-analyser` stays single-image-in, analysis-out — it never
learns container formats. No new dedicated extraction tool: extraction is
inseparable from the format parsing `document-analyser` already does
(pdfplumber/pypdf/markitdown), and a third tool would duplicate exactly that.
Other apps that need document images call the same `document-analyser`
endpoint and pipe results to `image-analyser` themselves (or let
`auto-analyser` route) — preprocessing is the caller's composition, not a
capability grafted onto the image specialist.

**2. Two classes of image-derived text.** *Verbatim* text (OCR of text
visibly present in the image; figure captions harvested deterministically
from the PDF text layer near the image) may enter signal computation.
*Generative* text (a vision-LLM description of what the image depicts) is
interpretation-layer only: shown in the gallery and reports, always flagged
as AI-derived (ADR-0014), never counted in keyword matches or substance
signals. Vision-LLM calls go through the existing BYOK main-process path,
not through the Python backend.

**3. Inclusion is a single global setting, off by default.** "Include image
text in analysis" is app-global (not per-project): either every project
counts image-derived verbatim text or none does, so cross-project comparisons
stay like-for-like. When on, affected results are visibly marked and
`analysis_cache` keys incorporate the setting (and the image-text extraction
version), so toggling invalidates rather than mixes cached results. In the
Project Corpus, image-derived text is appended per page as separately
flagged segments — never silently merged into `extractedText`.

**4. Storage and UI.** A new `document_images` table (document id, page/
anchor, index, dimensions, hash, thumbnail, OCR text, caption text,
AI description + provider/model, status) cascade-deletes with the document.
The Library's document view gains an image gallery: thumbnails, click for
full image + its text/analysis, and jump-to-page in the embedded PDF viewer
(the page metadata from decision 1 exists precisely for this).

## Alternatives considered

- **Teach image-analyser to accept PDFs/DOCX** — rejected: every container
  format added to the image specialist duplicates document-analyser's
  parsing, blurs the one-media-type-per-analyser family boundary, and drags
  document dependencies into a tool other consumers use for plain images.
- **A dedicated image-extraction tool** — rejected: its entire job is format
  parsing document-analyser already owns; a ninth family member for one
  function is surface without substance.
- **Bundle image-analyser as a second sidecar for captions/OCR** — rejected
  for the desktop app: second PyInstaller binary to build/sign/health-check,
  system deps (libzbar, libmagic, tesseract), and most of its modules
  (barcode, EXIF, quality, colour) are irrelevant here. Its caption/OCR
  module design and schemas remain the reference if a server deployment
  wants richer image analysis later.
- **Include LLM descriptions in the keyword counts** — rejected: breaks
  determinism/reproducibility of every downstream signal; a re-run against
  the same corpus could score differently.
- **Per-project include toggle** — rejected (for now): silently produces
  non-comparable numbers between projects; a global switch keeps the
  methodology footnote-able in one line.

## Consequences

- Phase 1 (extraction + thumbnails + gallery + jump-to-page) is fully
  deterministic and needs no new ML; pypdf's `page.images` is already a
  dependency. DOCX images come from the archive's `word/media/` with
  paragraph anchors — no page numbers exist in a flow format.
- OCR engine selection is deliberately deferred: tesseract means bundling a
  system binary; easyocr/rapidocr mean bundling model weights — the known
  PyInstaller clean-machine failure mode (ADR-0026 territory). Until an
  engine is chosen, verbatim text is limited to text-layer figure captions,
  and OCR can optionally be served by the flagged vision-LLM path as
  *transcription* — but then it is treated as generative (class 2) and
  excluded from signals.
- Word counts, intensity (per-1k-words), and coverage change when the global
  toggle is on — expected and visible, but every exported number must carry
  the flag or reviewers will compare unlike runs.
- Revisit if: a server deployment wants image-analyser's full report per
  image (then document-lens forwards extracted images to it instead of the
  BYOK path), or if an offline OCR engine proves bundleable, which would
  promote in-image text to class-1 verbatim.
