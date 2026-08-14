# ADR-0034: Framework-invocation terms counted apart from topic hits

**Status:** Proposed
**Date:** 2026-08-13
**Evidence:** researcher correspondence 30 Jul 2026 (`research-context/`); coding sheet v5 Search terms tab (row "FW — SDG framework (meta)") and Legend tab

## Context

The researchers stopped searching for "SDG" as a topic term: a report
saying "we support the SDGs" is **frame-adoption**, not engagement
with any boundary. Their sheet codes such hits as a separate Type
(`Framework`), excluded from real hits and framing, and counted on
the Delivery tab — because the *ratio* is diagnostic: "high invocation
with low boundary hits = adopting the label without engaging a
limit."

The app has no term class. A keyword is positive or counter
(ADR-0006); the literal strings "SDG" / "Sustainable Development
Goals" can only be ordinary keywords (polluting coverage and scores)
or disabled (invisible everywhere). Neither preserves the signal.

## Decision (proposed)

Add a third keyword class, **framework** (alongside the polarity
pair): matched and shown like any keyword in Read/Audit and the
per-mention export (Type = Framework), but **excluded from coverage
cells, scores, and substance signals**. Surface the invocation count
next to real hits (Delivery-style: "N invocations vs M boundary
hits") wherever per-document totals appear.

## Alternatives considered

- **A separate keyword list per project for meta-terms** — rejected:
  splits the curated list ADR-0006 deliberately unified, and nothing
  downstream would know to exclude it from scores.
- **Handle in the export only** (tag in the CSV, keep out of the app)
  — insufficient: in-app coverage/score numbers would keep counting
  frame-adoption as delivery, disagreeing with the manual sheets.

## Consequences

- Polarity becomes one dimension of a small keyword *kind* taxonomy
  (positive / counter / framework) — CONTEXT.md's Polarity entry and
  keyword UI need the third value spelled out (terminology is a
  decision, ADR-0018).
- The frame-adoption ratio becomes available as a corpus-scale signal
  the manual method can only compute per hand-coded document.
