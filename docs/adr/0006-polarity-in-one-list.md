# ADR-0006: Positive and counter keywords in one polarity-flagged list

**Status:** Accepted
**Date:** 2026-05 (design), reaffirmed through build
**Evidence:** `docs/design/user-stories.md` US-X-11, data model "Keyword.polarity"; Coverage/Compare/Track polarity filters

## Context

Detecting performative disclosure / greenwashing needs both the terms that
signal a topic *is* being delivered ("renewable energy initiatives") and terms
that signal it is being **undermined** or performatively framed ("fossil fuel
partnerships"). A naïve design keeps two separate keyword lists.

## Decision

Keep positive and counter keywords **in the same Keyword List**, distinguished
by a `polarity: 'positive' | 'counter'` flag. Both kinds carry the same axis tags
(the counter-keyword *for SDG 13* sits beside the positive keywords *for SDG
13*); polarity is the only difference. Every analysis view (Coverage, Compare,
Track, Read) can filter by `positive | counter | both`.

## Alternatives considered

- **Two separate lists** — rejected: hides the relationship between a topic's
  positive and counter signals and doubles maintenance.

## Consequences

- Greenwashing analysis is a *filter* over one list, not a separate workflow:
  Coverage filtered to `counter`, Compare scoring `positive − counter`, Track of
  counter-mentions over time.
- Feeds the Tone–Substance Gap (ADR-0010), where net keyword polarity is the
  "substance" axis.
