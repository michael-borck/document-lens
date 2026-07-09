# Document Lens — Focus / Auto-Research Mode

**Status:** Proposed (design decision, 2026-07-09). Not yet scheduled; it
reframes the analysis roadmap and should inform Phase 2+ design.
**Companion documents:** [`information-architecture.md`](./information-architecture.md),
[`user-stories.md`](./user-stories.md).

---

## Context

Document Lens exposes many analytical views (Coverage, Map, Track, Compare,
Audit, Score, Gap, …) over many configurable inputs (keyword-attached axes,
document-context axes, pillars, functions, individual keywords, individual
documents). The **cross-product of views × axes × keywords × documents is
large** — and with a real corpus (~400 Annual + Strategic reports) some views
are per-document and per-keyword, so the space *feels* unbounded.

Today the researcher must **stumble onto** the interesting permutation — the
outlier document, the telling keyword, the report where tone exceeds
substance. They cannot state up front what "interesting" or "optimal" means.
Without a repeatable way to surface direction, the tool risks being "text
extraction + slightly easier plots," leaving the same manual permutation-hunt
it was meant to replace (previously: read each document, tag/score by hand,
paste into a spreadsheet, analyse there).

Two further concerns motivated this record:
1. **Scale** — will the app stay responsive at ~400 documents when every
   view recomputes on demand?
2. **Reproducibility** — research output must be repeatable; anything driven
   by a GenAI/LLM must be transparently flagged (see the standing project
   principle).

## Decision

Add a **"Focus" mode** to the existing app (a new mode/tab, **not** a new
app; the current exploratory workflow stays). Focus mode brute-forces the
**deterministic** permutation space and surfaces direction, with two
sub-modes:

1. **Deterministic notability** — the repeatable backbone.
2. **AI-interpreted** — an optional layer that narrates the *same*
   deterministic outputs, clearly flagged as AI-generated.

Design principles:

- **Bounded, ranked — not rendered.** The permutation space is bounded
  (`views × axes × keywords × docs`). Do **not** render every permutation.
  Compute a scalar **notability score per permutation** and surface the
  **top-N extrema**. "Interesting" is never defined absolutely — only
  "notable = deviates most from the corpus."
- **"Interesting" = deterministic deviation.** Operationalise notability as
  outlier / deviation-from-corpus signals. These are exactly the Phase 3
  "substance" signals (repetition ratio, evidence-reuse across pillars,
  coverage spread, size-relative intensity). **Phase 3 is the engine** for
  Focus mode: each signal doubles as a ranking axis.
- **Deterministic backbone + AI layer, separated.** The notability ranking
  is deterministic and reproducible. The AI sub-mode reads the same numbers
  and interprets them; it is non-repeatable and always flagged. Build both.
- **Precompute + cache for scale.** Compute in the background into the
  existing `analysis_cache` table (`electron/schema.ts:288` — cached workflow
  results, invalidated when inputs change). Show cached results first;
  **re-run only what a keyword/axis edit touches** (the Audit workflow
  already does keyed-cache + input-invalidation: `buildAuditCacheKey` /
  `readAuditCache`). Full recompute only on a global change.
- **Feature matrix + ML in the backend.** Assemble a per-(document × signal ×
  permutation) matrix and run outlier detection / clustering / ranking in the
  Python backend (already has numpy). Keep the algorithms deterministic
  (fixed seed) so the ranking is reproducible.

## Consequences

- The phased roadmap becomes a set of **building blocks that assemble into
  Focus mode**, rather than independent features:
  - **Phase 3** (substance signals) → the notability metrics.
  - **Phase 4** (DOCX report) → the downloadable "run-all report" format.
  - **Phase 5** (AI observations) → the AI-interpreted sub-mode.
  - **New Phase 6** (Focus mode) → precompute + rank-by-notability + the two
    sub-modes.
- Phase 3 signals should be authored as **reusable notability metrics**
  (a value + a confidence indicator per document), not just display numbers,
  so they slot directly into Focus mode at no extra cost.
- A background precompute pipeline and cache-invalidation strategy become
  first-class concerns (not just per-view caching).

## DOCX report: a format, not a mode

The downloadable DOCX report is a **container**, not tied to one mode. What it
contains is decided by **where it is invoked from** — three scopes:

1. **This view** (from any exploratory view) — the current chart + its data
   table + the config that produced it. Small; "I found something, put it in
   my paper." (The app already does a primitive version for Track only.)
2. **Full project report** (a project-level "Export report") — *everything*,
   deterministic: document inventory, scores (X/4 tier **and** X/12 coverage),
   substance signals, one chart per view. **Bounded** — each *view* appears
   once with a default config, NOT every keyword × document.
3. **Focus report** (from Focus mode) — only the **ranked "notable" items**
   (the outliers), plus optional AI narration (flagged). The **same assembler
   as #2, pointed at a ranked subset** instead of everything.

Relationship: the full project report (#2) is the engine; the Focus report
(#3) reuses its assembler over a ranked subset; per-view export (#1) is a
lighter separate affordance. #1 and #2 are fully deterministic/reproducible;
#3's deterministic sub-mode is reproducible, its AI narration is flagged.

Build order: #2 first (self-contained, becomes the reusable assembler), then
#1, then #3 with Focus mode.

## Open questions

- Which notability metrics rank permutations, and how are they combined /
  weighted into a single "look here" ordering?
- How to bound the per-document / per-keyword explosion in the *output*
  (top-N per category? per axis? configurable?).
- Where the run-all executes — Python backend (pandas/ML) vs the app — and
  how results are cached and invalidated at 400-document scale.
- Overlap between the Focus-mode report and the Phase 4 DOCX report (one
  format, two entry points?).
- Confidence: every derived signal needs a confidence indicator — even human
  readers sensed these patterns without being able to articulate them.
