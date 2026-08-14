# ADR-0030: The find/judge split — the tool finds, the researchers judge

**Status:** Accepted
**Date:** 2026-08-13
**Evidence:** researcher correspondence 21 Jul – 7 Aug 2026 (`research-context/`, private); "Planetary uni coding sheet v5" (Coding sheet + Legend tabs); this repo's reply of 23 Jul 2026

## Context

The two domain researchers piloting the sustainability methodology
(annual-report study, Australian universities) formalised their manual
instrument as a coding sheet whose overriding principle is a strict
separation of **finding** a mention from **judging** it. The search is
deliberately neutral — short topic stems, nothing loaded — and every
act of interpretation happens in explicit, human-owned steps
afterwards:

- **Relevance gate** (Relevant / False positive / Not Found) runs
  before any coding; false positives ("carbon fibre", political
  "climate") are kept for audit, never deleted.
- **Framing** (0 Silent / 1 Aspirational / 2 Quantified / 3 Limit) is
  the core analytical judgement.
- **Contradiction/co-optation** is never coded per row; it is derived
  at document level from stated (SDG avowal) vs observed
  (countervailing activity) counts.

Their stated reason: the split makes the coding "cleaner and easier to
defend", and it "gives a clearer steer for Document Lens". This is the
external ratification of a boundary the app already leaned on
(deterministic signals, ADR-0011; flagged AI layer, ADR-0014).

## Decision

Adopt the find/judge split as the **contract between Document Lens and
the research methodology**:

1. **Finding is the tool's job and must be reproducible.** Locate
   mentions, allocate them to framework axes (SDG → pillar), work out
   where in the document each sits (section → Function), extract the
   passage and page. All deterministic.
2. **Judging is the researcher's job and the tool must not pre-empt
   it.** Relevance, framing, and contradiction judgements are recorded
   by humans. The tool supports judging — corpus-wide phrase
   exclusions and per-occurrence suppression already exist — but the
   *recorded* code is always the human's.
3. **The AI layer may propose, never decide.** A first-pass framing
   suggestion (flag the obvious goal-vs-limit cases for the researcher
   to confirm or overturn) is admissible under ADR-0014's rules —
   clearly flagged, BYOK, and stored separately from the accepted
   human code. The deterministic pipeline must not depend on it.

## Alternatives considered

- **Tool codes framing itself** (keyword heuristics for "net zero by
  20XX" etc.) — rejected: it pre-decides the core analytical step and
  makes the method indefensible; exactly what the researchers'
  proposal is designed to avoid.
- **Tool stays a pure search box** (no support for judgements at all)
  — rejected: validation (exclusions, per-hit rejection) is what turns
  a keyword count into a defensible reading, and those corrections
  improve every downstream signal (Focus ranking sharpens as false
  hits are rejected).

## Consequences

- The export boundary (ADR-0031) carries the split: pre-populated
  finding columns, empty judgement columns.
- Whether accepted judgement codes flow *back into* the tool (making
  it an instrument that can count and track framing across years)
  remains an open product decision; the researchers are indifferent
  ("I do not mind where they live"). If they come back in, they are
  human data the tool stores, not tool output.
- For the DSR paper this ADR is the traceable design response to
  practitioner feedback: guided emergence in the ADR trail.
