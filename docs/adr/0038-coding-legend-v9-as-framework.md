# ADR-0038: The v9 Coding Legend becomes shipped seed data, not bespoke code

**Status:** Proposed
**Date:** 2026-10-08
**Deciders:** Michael Borck (with Claude)
**Evidence:** `research-context/coding-legend-v9.md` (the codebook, verbatim
authoritative per Mike 14 Aug); `research-context/requirements-digest.md`
(items 1–7); existing seams: ADR-0006 (polarity), ADR-0031 (per-mention
export), ADR-0032 (two-zone prominence), ADR-0033 (five Functions),
ADR-0034 (framework-invocation terms), ADR-0037 (match mode)

## Context

The researchers' manual instrument — the v9 coding legend and its Excel
sheet — encodes a complete, battle-tested methodology: a relevance gate
(Relevant / False positive / Not Found), a Framing axis (0 Silent /
1 Aspirational / 2 Quantified / 3 Limit), the five-domain Function axis,
positional Prominence (Leadership voice / Body), Provenance (Mandated /
Voluntary), and a three-way Type (SDG / Countervailing / Framework-invocation).
It also happens to contain what discourse analysis would call a
commitment/modality scale — arrived at independently, for this corpus.

The temptation is to build a bespoke "validation module" that reads their
spreadsheets and reproduces their tabs. That would fork the methodology:
one copy living in Excel, one in code, drifting forever.

## Decision

Implement the legend **as data through the existing seams**, so there is one
methodology and the app stays a general instrument:

- **Search stems** → the SDG keyword framework shipped as seed data, prefix
  match mode where the legend types a stem (ADR-0037).
- **Countervailing terms** → counter-polarity keywords in the same list
  (ADR-0006); the shared SDG 13/7 climate counter-list maps to keyword tags.
- **Framework invocations** (Type = FW) → a separate invocation-terms list
  counted apart from boundary engagement (ADR-0034).
- **Relevance gate** → exclusion phrases (sentence-level veto) +
  per-instance span suppression; False positives are kept for audit, never
  deleted — matching the sheet's own discipline.
- **Domain axis** → the existing Function lens and its classification
  (ADR-0033); Cross-cutting remains human-only, tallied separately.
- **Framing, Prominence, Provenance** → human-coded per-mention attributes.
  They enter the tool through the codes-back-in seam (digest item 5,
  Michael's call): a per-mention annotation store keyed by (document,
  offset, keyword) — the one new primitive this ADR commits to. Prominence
  automation later follows ADR-0032's fallback rule.
- **The spreadsheet itself** stays the researchers' deliverable: the
  per-mention export (ADR-0031) produces their shape with Framing and
  Prominence columns empty, humans fill them, and the calibration protocol
  (`research-context/calibration-protocol.md`) closes the loop by comparing
  the filled sheets back against tool signals.

No feature may be built that exists only to serve this legend; anything the
legend needs must land as a general capability (framework data, an axis, a
scoring rule, an annotation primitive).

## Alternatives considered

- **A bespoke validation/coding module mirroring the Excel sheet** —
  rejected: forks the methodology, duplicates the Delivery-tab logic in
  code, and every legend revision (v5 → v9 happened in months) becomes an
  app release.
- **Leave all codes in Excel; tool stays a search step** — rejected per
  digest item 5: the difference between a search tool and an instrument is
  the ability to count, score, and track the humans' codes across years.
- **Automate Framing with the BYOK AI layer now** — rejected: framing is
  the researchers' judgement (find/judge split, ADR-0030); the GenAI ladder
  (ADR-0035) admits it later as a flagged suggestion only, and the recorded
  code stays the accepted human one.

## Consequences

- Legend revisions are edits to seed data (and a `SCHEMA_VERSION` bump when
  seeding semantics change), not code changes.
- One new primitive: per-mention human annotations. It must be
  general (any workflow that can point at a span can attach a code), or it
  becomes the bespoke module this ADR forbids by another name.
- The calibration study can measure tool-vs-human agreement without either
  side changing instruments; the human ceiling from ICR is the accuracy
  target for the tool's deterministic signals.
- Risk: the legend's category boundaries (e.g. Governance vs Operations)
  are contested ground — the Function lens may need seed-value description
  updates to track legend revisions; that is data maintenance, and the
  calibration protocol's codebook diff feeds it.
- Revisit if: the researchers adopt an app-external analysis tool, or a
  legend revision introduces a concept no existing seam can express.
