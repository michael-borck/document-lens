# ADR-0011: Deterministic "substance" signals as reusable notability metrics

**Status:** Accepted
**Date:** 2026-07-09
**Evidence:** `6e0611e` (repetition/diversity/intensity), `af31e2d` (evidence-reuse), `63f1de1` (coverage-spread); `src/services/substance.ts`; `docs/design/focus-auto-research-mode.md`

## Context

Coverage/Compare/Track/Score answer *how much* a document says, but a researcher
still had to *stumble onto* the interesting document — the tool risked being
"text extraction + easier plots". Reviewers sensed patterns (a large org that
ticks every box but reuses one small project across pillars) they couldn't
articulate or measure.

## Decision

Author a set of **deterministic "substance" signals** — repetition (matches ÷
unique keyword), diversity (keyword breadth), intensity (matches / 1k words),
evidence-reuse (share of matches on multi-pillar keywords), coverage-spread
(fraction of the pillar×function matrix filled) — as **pure, reusable functions**
that each return a value **plus a deterministic evidence-confidence (0–1)**. They
are surfaced first as Compare metrics (rankable, groupable by company size/type),
and are designed to double as ranking axes for a future Focus mode (ADR-0012).

## Alternatives considered

- **Company-size-normalised commitment** — blocked: no company-size data exists;
  a manual Small/Medium/Large facet was added instead so the pattern *emerges*
  as a comparison, not a formula.
- **An LLM "what's interesting" pass** — kept as a separate, flagged layer
  (ADR-0014); the deterministic ranking is the repeatable backbone.

## Consequences

- "Interesting" is operationalised as deviation-from-corpus — repeatable and
  reproducible, suitable for a research method.
- Each signal carries confidence so an extreme ratio on thin evidence is visibly
  discounted.
