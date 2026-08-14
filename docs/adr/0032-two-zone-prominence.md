# ADR-0032: Two-zone positional prominence — Leadership voice vs Body

**Status:** Proposed
**Date:** 2026-08-13
**Evidence:** researcher correspondence 23–30 Jul 2026 (`research-context/`); coding sheet v5 Legend tab (Axis 3)

## Context

The researchers' methodology originally scored prominence
High/Medium/Low by where a mention sits on the page. They collapsed it
to **two positional zones precisely so a tool can automate it**:

- **Leadership voice** — VC/Chancellor statement, foreword, or an
  explicit strategic-priority listing. "The register the institution
  answers for."
- **Body** — everything else, including standing KPI tables.

Their fallback, offered explicitly: "VC/Chancellor statement =
leadership voice, everything else = body — as simple as you need, but
automated." Zone weight (Ldr ×2, Body ×1) drives their document-level
stated-vs-observed comparison; zone *divergence* between avowal and
countervailing activity auto-resolves their say-do gap without a
human read.

The app classifies sections by Function via embeddings (ADR-0007) but
has no zone concept, and paragraph-grain sectioning (`sections.ts`)
deliberately ignores headings because the backend's header detection
returns no offsets (noted there as a known limitation). Judging
position needs layout information the extraction pipeline does not
currently surface.

## Decision (proposed)

Add a **document zone** attribute alongside Function, binary for now:

1. Detect the Leadership-voice zone at import as a **page/offset
   range**, using the simplest reliable signal first: heading match
   ("Vice-Chancellor", "Chancellor('s) (report|statement|foreword)",
   "From the Vice-Chancellor" …) on early pages, falling back to a
   manual per-document zone marker in the UI when detection fails
   (the researchers accept manual for the pilot).
2. Every mention inherits the zone from its offset, exactly as it
   inherits section and page today.
3. Zone flows into the per-mention export (ADR-0031) and becomes
   groupable in Compare/Map like any document-context axis.

Strategic-priority listings are explicitly out of scope for v1 —
collapse to the researchers' fallback rule.

## Alternatives considered

- **Embedding-classify zones like Functions** — rejected for v1: the
  zone is positional ("where it sits on the page"), not semantic; a
  VC's climate paragraph reads like any climate paragraph.
- **Full layout extraction (headings, font sizes) from PDFs** —
  deferred: right capability, disproportionate cost for a binary zone
  the fallback rule approximates.
- **Leave prominence entirely manual** — the pilot's status quo;
  rejected as the end state because zone tagging is the researchers'
  top automation request and the whole reason they simplified the
  axis.

## Consequences

- Automating the zone converts their Delivery-tab divergence check
  into something the tool can compute per document — a step toward
  the "instrument, not search tool" direction (ADR-0030 consequences).
- Detection quality must be reported honestly (fail loudly,
  ADR-0026): a mis-zoned foreword corrupts the weighted comparison,
  so the manual override is part of the design, not a stopgap.
