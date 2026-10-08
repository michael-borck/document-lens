# ADR-0040: Deterministic layout pass — PyMuPDF headings feed prominence zones *(backend)*

**Status:** Accepted (implemented — layout pass, offset alignment,
document_headings persistence, zone derivation + override, per-mention
export, Track grouping, Stated-vs-Observed)
**Date:** 2026-10-08
**Deciders:** Michael Borck (with Claude)
**Evidence:** ADR-0032 (two-zone prominence; its "full layout extraction —
deferred" alternative is what this ADR revisits); `research-context/requirements-digest.md`
item 3 (Mike's top automation ask); ADR-0020 (canonical per-page PDF text);
ADR-0026 (fail loudly); ADR-0027 (heavy-OCR-deps precedent for rejection);
ADR-0035 (this is rung 0 — deterministic geometry); ReportParse (Morio et
al. 2024 — layout vocabulary and the PyMuPDF-as-fast-reader precedent).
Code lives in the co-developed `document-analyser` repository.

## Context

Prominence (Leadership voice vs Body) is the researchers' top automation
request, simplified to two positional zones *precisely so a tool can
automate it* (ADR-0032). The blocking gap: extraction surfaces per-page
text only — no headings, no positions — and the fallback heading match
("From the Vice-Chancellor…") runs against page text where a heading is
indistinguishable from a body sentence that merely mentions the VC.

ReportParse's layout analysis demonstrated the shape of the answer but
used deepdoctection — tesseract, poppler, detectron2, a pinned torch.
ADR-0027 already rejected that dependency class for this product.
**PyMuPDF** provides the same *deterministic* signals the zone actually
needs — per-span bounding boxes, font sizes, bold flags — as a pure-pip,
fast, CPU-only library, and is used as ReportParse's own default reader
("fast, no OCR errors, well tested"). The cost assumption behind
ADR-0032's deferral no longer holds.

## Decision

Add a **deterministic layout pass** to `document-analyser`'s PDF pipeline,
and persist only what consumers need:

1. **Layout pass (backend).** For each page, PyMuPDF reports text spans
   with bbox, font size, and bold flag. A span is a *heading candidate*
   when its font size exceeds a threshold relative to the page's median
   body size (with bold as a tiebreaker). No ML, no OCR — rung 0 of the
   ladder: same PDF in, same headings out, every time.
2. **Offset alignment (backend).** Each heading candidate is aligned to
   the canonical `extracted_text` (ADR-0020) by order-preserving,
   whitespace-normalised matching within its page — headings become
   `{page_number, start_offset, end_offset, text, font_size}` in the same
   coordinate system the app already joins on (sections, suppressed
   spans). Candidates that fail alignment are dropped and the drop count
   is reported in the extraction response (fail loudly, ADR-0026), never
   silently.
3. **Persistence (app).** A `document_headings` table stores the aligned
   headings at import (schema bump — greenfield wipe per ADR-0004). The
   PDF on disk remains the source of truth: the pass is re-runnable over
   the whole Library any time, so storing headings — not every block — is
   a safe minimality, not a loss.
4. **Zone derivation (app).** Leadership-voice zones derive from headings
   via ADR-0032's fallback rule: a VC/Chancellor heading opens the zone;
   the next heading of equal or higher rank closes it. Every mention
   inherits the zone from its offset, exactly as ADR-0032 specifies, and
   the zone flows into the per-mention export (ADR-0031) and
   Compare/Map grouping. The manual per-document zone override stays —
   mis-zoning corrupts the weighted comparison, so detection quality is
   surfaced, not assumed (ADR-0026, ADR-0032 consequence).
5. **Non-fatal.** The pass runs after text extraction commits, image-
   extraction style (ADR-0027): a document whose layout pass fails still
   imports cleanly, defaults to Body, and reports layout-unavailable.

Out of scope, with revisit triggers: strategic-priority listings (needs a
semantic notion of "priority" — revisit with ADR-0039's models if the
fallback proves too coarse); full block/table/figure role storage
(revisit for phase-2 image text, ADR-0027); wholesale extractor swap to
PyMuPDF (revisit only if offset alignment proves brittle on real reports).

## Alternatives considered

- **deepdoctection full layout** (ReportParse's reader) — rejected: the
  heavy dependency class ADR-0027 rejected; its table/figure/OCR output
  solves problems the two-zone model does not have.
- **Embedding-classify zones like Functions** — rejected in ADR-0032 and
  still wrong: the zone is positional, not semantic.
- **Switch PDF extraction to PyMuPDF entirely** (text + geometry from one
  library, no alignment step) — deferred: cleaner end-state, but it changes
  canonical text on every document and invalidates every stored count in
  one move. The alignment pass is additive and reversible; take the big
  swap only if alignment proves brittle.
- **Store all blocks now** — rejected: headings cover both current
  consumers (zones, better sectioning); blocks are re-derivable from the
  PDF on demand, so deferral costs nothing.

## Consequences

- The Leadership-voice zone automates end-to-end at rung 0: deterministic,
  version-free, offline, no model downloads — and it upgrades sectioning
  for free (headings with offsets fix the "header detection returns no
  offsets" limitation noted in ADR-0032).
- The zone weight (Ldr ×2, Body ×1) and the Delivery-tab divergence check
  become computable per document — the "instrument, not search tool"
  direction (ADR-0030).
- New consumer contract: extraction responses gain a layout section with
  an alignment-quality field; the app's import must persist headings and
  derived zones (schema bump).
- Heading-threshold tuning is a real risk — annual reports use wildly
  divergent typography. Mitigation: the synthetic corpus (ADR-0028) gains
  authored forewords and known zones, so detection quality is measured
  against ground truth before real corpora, and per-document overrides
  carry the residual.
- Revisit if: alignment quality on real reports is poor (→ extractor
  swap), or the researchers' v10 legend adds positional categories beyond
  the two zones (→ store blocks).
