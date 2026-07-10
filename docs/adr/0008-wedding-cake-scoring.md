# ADR-0008: Wedding Cake scoring — modes, generalisation, and the X/12 ratio

**Status:** Accepted
**Date:** 2026-05-12 (model), 2026-06-17 (generalisation), 2026-07-09 (X/12)
**Evidence:** `0e00b6b` (rule), `c104a79` / `3d3052e` (v1 + full modes), `fdd32dc` (cross-coverage + coverage-count patterns), `c40130e` (X/12 ratio); `src/services/_shared/wedding-cake.ts`

## Context

The sustainability methodology scores a document by whether each core **Function**
delivers across all required **Pillars** simultaneously. This must (a) work
before every document is classified, (b) generalise beyond sustainability, and
(c) distinguish "broad but shallow" from "empty".

## Decision

- **Model:** the built-in `wedding-cake` rule awards a point per Function that has
  positive matches in *all* required Pillars (Biosphere/Society/Economy); the
  score is the count of qualifying Functions — a **0–4 tier**.
- **Two modes behind one evaluator seam:** `full` (all docs Function-classified →
  the 2D Pillar×Function matrix) and `v1`/fallback (classification incomplete →
  a 1D Pillar-coverage prerequisite proxy). Banners state which mode is active.
- **Generalisation:** the evaluator was renamed to a generic `cross-coverage`
  pattern (legacy `wedding-cake` kept as a registry alias) and a flat
  `coverage-count` pattern added, so other domains (e.g. NIST CSF maturity) get
  their own rule shape. Rules are edited via a **form**, not a DSL.
- **Fine-grained X/12 ratio:** because the X/4 tier can't tell a document where
  every Function covers 2 of 3 pillars from one with nothing (both 0/4), each
  document also carries pillar-coverage summed across Functions (`pillarsCovered
  / pillarsPossible`, e.g. 6/12) + per-Function partial credit — **without**
  changing the tier.

## Alternatives considered

- **A scoring DSL/expression language** — deferred as a future escape hatch; a
  form editor covers the current rule shapes.
- **Only the X/4 tier** — rejected: loses the broad-but-shallow distinction.

## Consequences

- One scoring seam (`evaluateScore` → Evaluation Trace) feeds Score, Compare, and
  Track, so the numbers reconcile (ADR-0016).
- The score is auditable (the trace / matrix that produced it is shown).
