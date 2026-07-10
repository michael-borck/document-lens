# ADR-0012: Focus / auto-research mode — bounded, ranked, deterministic + flagged AI

**Status:** Proposed (design recorded; not yet implemented)
**Date:** 2026-07-09
**Evidence:** `docs/design/focus-auto-research-mode.md`; `b6f3496` (decision record)

## Context

The permutation space of views × axes × keywords × documents is large (a real
corpus is ~400 reports); "interesting"/"optimal" cannot be defined absolutely.
Research output must be repeatable, and any GenAI must be transparently flagged.
Without direction, the researcher hunts permutations by hand.

## Decision

Add a **Focus mode** (a new mode in the existing app, **not** a new app) that
brute-forces the *deterministic* permutation space, computes a **scalar
notability score per permutation** (deviation-from-corpus, built on the ADR-0011
signals), and **surfaces the top-N extrema** — it never renders every
permutation. Two separated sub-modes: **deterministic notability** (reproducible
backbone) and an **AI-interpreted narration** layer (always flagged,
non-repeatable). Precompute into `analysis_cache`; recompute only what a
keyword/axis edit touches.

## Alternatives considered

- **Render every permutation** — the "unbounded" trap (a 5,000-page dump);
  rejected in favour of compute-a-scalar-then-rank.
- **A separate app** — rejected: reuse the existing engine + report assembler.
- **AI as the primary direction-finder** — rejected as non-repeatable; AI is a
  layer on top of the deterministic ranking, not the ranking.

## Consequences

- Phases 3 (signals), 4 (report assembler, ADR-0013), and 5 (AI, ADR-0014) are
  the building blocks this mode assembles.
- Requires a background precompute + cache-invalidation strategy to scale to
  hundreds of documents.
- **Status:** decided in principle; a design record exists, implementation is
  future work.
