# ADR-0035: GenAI last — the method ladder is deterministic → interpretable ML → generative

**Status:** Accepted
**Date:** 2026-08-14
**Deciders:** Michael Borck
**Evidence:** the cross-cutting principle already noted in `SUMMARY.md` across ADR-0007 / 0010 / 0011 / 0012 / 0014; sibling record `cite-sight` ADR 0002 (same ladder, evidence from a 24-reference audit resolved entirely at rung one); DSR paper design principles (`research-context/`, paper repo §5)

## Context

Document Lens has always held generative AI at arm's length — embeddings
classify (ADR-0007), signals are computed deterministically (0010, 0011),
BYOK AI is opt-in and flagged (0014) — but the stance lived as a scattered
cross-cutting note, not a decision with stated reasons. Meanwhile the field's
default reflex is LLM-first, and the corpus study will soon produce
expert-labelled judgements (relevance, framing, prominence) that make a
learned component genuinely attractive for the first time. Without a recorded
rule, that is exactly the moment scope drifts.

## Decision

Method selection escalates in order, and each rung must **measurably fail**
before the next is used:

1. **Deterministic first** — rules, exact matching, set arithmetic, position
   and structure; every computed signal reproducible run-over-run.
2. **Interpretable ML second** — when a judgement genuinely needs learning
   (the labelled corpus makes this real), prefer transparent models (decision
   tree / forest) whose splits can be read, tested offline against held-out
   labels (model-vs-human Cohen's κ), and explained per decision. Small local
   models only if they demonstrably beat the tree.
3. **Generative last** — LLMs remain an opt-in, always-flagged
   *interpretation* layer. They may explain or suggest; they never compute a
   signal of record. Any ML- or AI-suggested judgement appears **beside** the
   deterministic evidence trace, and the human accepts or overrides.

Reasons: cost (corpus-scale runs multiply per-call prices), non-determinism
(an instrument whose readings flip between runs is not an instrument), and
evidencability (a rule or split is its own audit trail; researchers must be
able to defend every coded judgement to a reviewer).

## Alternatives considered

- **LLM-first classification of mentions/judgements** — rejected: per-mention
  cost at corpus scale, non-reproducible outputs undermine the tool's core
  claim (local-first, reproducible instrument), and coded judgements would
  rest on unexplainable model behaviour.
- **Leaving the principle as the SUMMARY.md note** — rejected: a note
  describes the past; an ADR binds the future. The labelled-corpus moment
  needs the binding form.

## Consequences

- The planned learned-judgement feature (research programme "paper D") is
  constrained in advance: tree-first, κ-evaluated, suggestion-only, trace
  stays deterministic.
- Researcher feature requests involving AI are triaged against the ladder:
  most become roadmap entries or interpretation-layer candidates, not signal
  changes.
- The tool keeps its differentiated position (reproducible instrument in an
  LLM-first field) — this is a feature of the papers, not an accident.
- Revisit if: a judgement task shows measured rule/tree failure on the
  labelled corpus AND a generative option can be pinned (fixed model,
  temperature 0, frozen regression corpus) AND per-document cost fits
  local-first use. All three, not any one.
