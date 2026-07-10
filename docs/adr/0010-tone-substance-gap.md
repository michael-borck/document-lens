# ADR-0010: Tone–Substance Gap — keyword polarity is not text sentiment

**Status:** Accepted
**Date:** 2026-05-21
**Evidence:** `docs/superpowers/specs/2026-05-21-tone-substance-gap-design.md`; `cc9d13c` / `c27c733` / `a3f8ae5` / `7507a41` (Gap workflow, US-C-02)

## Context

In corporate disclosure the *tone* is almost uniformly positive, so an absolute
sentiment score is uninformative. Performative disclosure ("greenwashing")
manifests as **tone running ahead of substance** — warm language without matching
substantive commitment. Raw keyword counts miss this; raw sentiment miss it too.

## Decision

Add a **Tone–Substance Gap** workflow that plots two deliberately-orthogonal
quantities: **substance** = net keyword polarity (a curated keyword property,
x-axis) and **tone** = backend text sentiment (a model-inferred property,
y-axis), normalised to −1..+1, at document / section / keyword levels. The
**gap** is the signed distance between them; a gap-over-time view shows whether
the delta widens or closes across the corpus. Gated on backend availability with
an explicit ML caveat.

## Alternatives considered

- **Report absolute sentiment** — rejected: uninformative when tone is uniformly
  positive.
- **Fold sentiment into keyword polarity** — rejected: they measure different
  things (curated vs inferred); keeping them orthogonal is the whole signal.

## Consequences

- A repeatable, quantitative proxy for performative disclosure.
- Depends on a model-inferred sentiment signal, so it carries a precision caveat
  (design principle: label ML signals as signals, not facts).
