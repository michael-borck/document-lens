# ADR-0031: Per-mention validation export, deduplicated one row per SDG per passage

**Status:** Accepted (implemented 2026-08-14)
**Date:** 2026-08-13, revised 2026-08-14 (v9 template + Mike's confirmation)
**Evidence:** researcher correspondence 23 Jul – 14 Aug 2026 (`research-context/`); coding sheet v9 template "Coding sheet" tab (target column shape); `src/services/per-mention-export.ts` (+ its test) — ships as `mentions.csv` / `mention-counts.csv` in the Setup CSV bundle

## Context

The current CSV bundle (`export-all.ts`) emits `keyword-matches.csv`
as one row per document × keyword with a **count** — the researchers'
manual instrument needs one row per **mention** so each retrieved
passage can pass their relevance gate and be coded. Everything the row
needs is already computed in memory: concordance spans
(`concordance.ts`), offset → page (`document-pages.ts`), offset →
section (`sections.ts`), section → Function tag, keyword → SDG/pillar
tags. There is simply no egress for it beyond "Copy phrase".

Counting rules also differ. The app merges overlapping spans within
one keyword-plus-synonyms concept, but different keywords hitting the
same sentence each count, and a keyword tagged with several SDGs
counts once per tag — so "net zero carbon emissions" can count three
times where the methodology counts it once.

## Decision

Add a **per-mention export** (CSV; openable in Excel) shaped to the
coding sheet:

- One row per mention: **university name** (their v9 sheet derives
  mission group from it by lookup — the tool does NOT export a
  grouping column; one source of truth is their sheet), document,
  year, SDG (+ short name, cluster/pillar), matched term, passage
  (sentence, extendable to paragraph), section Function, page,
  prominence zone when available (ADR-0032), keyword polarity/type.
- **Deduplication rule = one row per SDG per passage.** Multiple
  stems firing in one passage for the same SDG collapse to one row;
  the same passage raising different SDGs gets one row each. Exact
  repeats are flagged, not silently dropped (the researchers audit
  them).
- **Alongside the deduplicated rows, report the raw mention count per
  document** — the researchers' denominator for the false-positive
  rate and the mention-versus-claim gap (Mike, 14 Aug).
- **Judgement columns ship empty**: Relevance, Framing, Prominence
  (until automated), Notes. **Provenance ships defaulted to
  "Voluntary"** for the researchers to overwrite where Mandated
  (legally required climate-risk disclosure). No contradiction column
  — that is derived at document level in their Delivery tab.
- The **Domain column is a tool suggestion and stays overridable**;
  the tool never assigns their sixth value, Cross-cutting — that is a
  human judgement (see ADR-0033).
- Rows suppressed in-app and exclusion-vetoed hits are excluded (or
  emitted flagged), matching what Coverage/Score count, so the export
  and the in-app numbers reconcile.

The same dedup rule should eventually govern in-app counting
(`coverage-2d.ts` per-tag increments), so exported rows, coverage
cells, and scores all agree; until then the export documents its own
rule.

## Alternatives considered

- **XLSX with the researchers' formulas** — rejected for now: adds a
  dependency, and their sheet's auto-columns (Type, dupe flag,
  Delivery tab) already recompute from pasted rows.
- **Keep count-per-document and let researchers find passages in
  Read** — rejected: retyping passages by hand is the slog the tool
  exists to remove, and hand-copied passages break the audit chain.

## Consequences

- The researchers' validation loop (gate → frame → judge) can run at
  pilot scale (~10 reports, 4 environmental SDGs) against tool output,
  which is the naturalistic evaluation the DSR paper reports (§7.1).
- The export becomes the **independent re-checkability** artefact the
  paper claims (§7.2): a third party can reconstruct reported numbers
  in a spreadsheet.
- Help text describing the current counts file as "one row per match"
  (`Help.tsx`) must be corrected either way.
