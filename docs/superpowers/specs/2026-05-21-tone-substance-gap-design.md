# Tone–Substance Gap — design spec

**Date:** 2026-05-21
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Workflow tab:** new — "Gap" (9th workflow, after Score)
**Relates to:** US-C-02 (reframed), US-X-10 (coarse-signal caveat), design principle #8

---

## 1. Motivation (ships verbatim in spec + methodology doc + in-app Help)

The gap is more informative than either axis alone, for a specific reason: in
corporate disclosure the tone is uniformly positive, so absolute sentiment
barely varies. What varies meaningfully is how far the tone runs ahead of (or
behind) the substance. Subtracting one axis from the other cancels out the
baseline positivity that makes raw sentiment useless here. You're left with a
residual: tone not justified by substance.

What the gap means (think of it as a 2D space — substance on x, tone on y):

|           | High substance (delivery)          | Low substance (counter / sparse)            |
|-----------|------------------------------------|---------------------------------------------|
| High tone | aligned — genuine good news        | talk > walk → performative / greenwashing   |
| Low tone  | walk > talk → understated / candid | aligned — honest about gaps                 |

The interesting quadrant is top-right→ off-diagonal: lots of upbeat language,
little delivery vocabulary (or counter-keywords present). The magnitude of that
vertical distance from the diagonal is your greenwashing intensity.

**Why polarity ≠ sentiment (keep distinct in the Help text):** polarity is a
property of the *keyword* (curated: positive = delivery, counter = performative
vocabulary); sentiment is a property of the *text* (model-inferred tone). They
are orthogonal. Greenwashing is positive in tone but hollow in substance, so the
gap between them is the signal — neither axis shows it alone.

## 2. The metric

Both axes are normalized to the range −1..+1.

- **Substance (x)** = net keyword polarity. Aggregate levels:
  `(positive_matches − counter_matches) / (positive_matches + counter_matches)`.
  Range −1 (all counter/performative vocabulary) … +1 (all delivery vocabulary).
  If `positive + counter == 0`, the unit has no substance signal and is excluded.
  Match counts come from the synonym-aware shared matcher
  (`src/services/_shared/keyword-match.ts`).
- **Tone (y)** = sentiment `score` (−1..+1) from the backend
  (`SentimentResponse.score`).
- **Gap** = signed vertical distance from a reference line:
  - **Default — absolute:** distance from the 1:1 diagonal (`gap = tone − substance`).
    Works for a single document; interpretable as greenwashing intensity.
  - **Toggle — corpus residual:** fit `tone ~ substance` across all units in the
    current view and measure distance from that best-fit line. Enabled only when
    there are enough units to fit (threshold defined in the plan; e.g. ≥ 8 docs).
    Controls for sector baseline but is relative (misses uniform greenwashing).

### Per-level definition

- **Document** — substance = net polarity over the whole document; tone =
  length-weighted average of its section sentiments. One dot per document.
- **Section** — substance = net polarity of matches within the section; tone =
  that section's sentiment. One dot per section.
- **Keyword (hits only)** — only keywords with ≥1 match in the document are
  plotted. A single keyword is intrinsically one polarity, so **substance =
  polarity sign (−1 or +1)**, **dot size = match frequency**, tone = average
  sentiment of the sections its matches fall in. A counter-keyword (x = −1)
  sitting high on tone is the greenwashing fingerprint.

## 3. Sentiment strategy (cost control)

**Compute sentiment once per section; derive all three levels from it.**

1. Detect sections locally with `detectSections` (no backend, no prior
   classification required).
2. Map keyword matches → sections locally (matcher positions → section ranges,
   same technique as `coverage-2d`).
3. Send only the section *texts* to the backend via `api.analyzeSentimentBatch`.
   A 40-section document = ~40 sentiment values, not one per keyword match.
4. Keyword tone reuses the sentiment of the section each match falls in (coarser
   than per-sentence; acceptable for v1, refine later).

**Caching:** sentiment results are cached in `analysis_cache` (the Audit
pattern) keyed by project + document + a hash of the section set, so re-opening
Gap is instant and recompute happens only when extracted text / sections change.

## 4. Architecture

- `src/services/gap.ts` — new service. Computes substance (local), orchestrates
  section sentiment (backend + cache), assembles per-level datasets + the
  over-time aggregation. Reuses: `_shared/keyword-match`, `sections.detectSections`,
  `api.analyzeSentimentBatch`, `analysis_cache`, and Track's year-bucketing logic.
- `src/pages/workflow/Gap.tsx` — new page. Scatter explorer + over-time chart.
- Workflow nav — add the Gap tab after Score (`WorkflowTabs` + routing).

Keep `gap.ts` focused on computation and `Gap.tsx` on presentation; the
substance/tone/gap math is pure and independently testable.

## 5. Views

- **Scatter explorer** — recharts `ScatterChart`. Tabs: Document / Section /
  Keyword. Dots colored per document. `ReferenceLine` diagonal. Quadrant labels
  (Performative / Genuine / Understated / Honest gaps). Normalization toggle
  (absolute ↔ corpus residual; residual disabled until the doc threshold is met).
- **Gap over time** — line of average document-level gap per year. Shown only
  when the sufficiency guard passes (≥ 2 distinct years that have documents).

## 6. Error / empty / offline states

- **Backend required:** tone needs sentiment, so the whole view requires the
  backend. When the engine is down/unreachable, show the standard "backend
  required" empty state (mirror Audit Anomalies). Substance is local, but it is
  not shown alone.
- Documents without extracted text are excluded.
- Single-document project: hide the Document tab and the over-time chart.
- Coarse-signal caveat shown inline in the view (design principle #8 / US-X-10).

## 7. Documentation requirements

The §1 rationale + quadrant table must appear in:
1. this spec (done),
2. the methodology doc — `src/data/frameworks/KEYWORD_METHODOLOGY.md`,
3. the Gap view's in-app Help (`src/pages/Help.tsx`).

## 8. Validation (no automated test suite)

The pure substance/tone/gap math should get unit-level checks where practical.
Because the metric is novel and built on a coarse sentiment input, the plan
includes a **manual validation pass**: run Gap on a sample corpus, open a few
points flagged "performative," and confirm the passages read as
tone-ahead-of-substance before trusting the ranking.

## 9. Out of scope (v1)

- Per-sentence (vs per-section) keyword tone — refinement for later.
- Exporting the Gap scatter / over-time as paper-ready artifacts — follow-up
  (the existing bundle-export covers Track; Gap export can mirror it later).
- US-B-02 (multi-framework side-by-side) — unrelated, remains unbuilt.

## 10. Resolved decisions

- All three levels in one view via tabs; colored per document. *(approved)*
- v1 ships both the explorer and the over-time trend; over-time gated by data
  sufficiency. *(approved)*
- Gap = absolute distance from diagonal by default, corpus residual as a toggle
  when enough docs. *(approved)*
- Lives in a new dedicated "Gap" workflow tab. *(approved)*
- Keyword level: polarity on x, frequency as dot size. *(approved)*
