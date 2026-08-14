# ADR-0033: Five delivery Functions (+ human-only Cross-cutting); grouping derived from university name

**Status:** Accepted (seed + score implemented 2026-08-14; in-app section-tag override still open)
**Date:** 2026-08-13, revised 2026-08-14 (v9 template + Coding Legend)
**Evidence:** researcher correspondence 30 Jul – 14 Aug 2026 (`research-context/`); "Coding legend FULL" v9 (`research-context/coding-legend-v9.md`); coding sheet v9 template (Grouping auto-derived via `GroupMap`); "University groupings" 2026 snapshot

## Context

The app seeds four Function values (teaching, research, engagement,
operations — `sdg-meta.ts`) and scores the seeded cross-coverage rule
out of 4×3=12. The researchers settled on **five** delivery domains —
**Research, Teaching/curriculum, Engagement, Campus operations,
Governance** (renamed from "Governance/strategy" in v9) — so coverage
is 3 pillars × 5 = 15 "everywhere". Governance is where universities'
strategic avowals concentrate; dropping it hides the zone the say-do
analysis needs. They also authored a **Coding Legend** with a
definition, an includes-list, a test, and a boundary rule per domain —
explicitly designated (14 Aug) as what should drive the app's
automatic domain tagging, replacing the older spreadsheet Legend tab.

Two further points from their 14 Aug direction:

- There is a **sixth value, Cross-cutting** — a whole-of-institution
  claim that names no single function (deletion test). Assigning it
  is a human judgement; the tool must never produce it, and it tallies
  separately from the five.
- **Mission group is not a tool attribute.** Their v9 sheet derives
  Go8 / ATN / IRU / RUN / Unaligned from the university name by lookup
  ("one source of truth: you supply the university, the sheet computes
  the group"). This supersedes the earlier plan to repurpose the
  Small/Medium/Large facet.

The scoring evaluator is already generic (`cross-coverage` takes any
axes; 4×3 is seeded data, not code), so the Function change is
data/config.

## Decision

1. Re-seed the sustainability Function lens with the researchers'
   **five** domain values, using the Coding Legend definitions
   (definition + includes + test) verbatim as the embedding
   descriptions, and update the seeded Wedding Cake rule to levels
   0–5 / coverage out of 15. Existing projects keep their axes
   (greenfield DB, ADR-0004).
2. **Cross-cutting is not a classification target.** The classifier
   only ever assigns one of the five; Cross-cutting exists only as a
   human override value (in the export's overridable Domain column,
   and in-app if section tags become editable). It is excluded from
   the 15-cell grid and tallied separately.
3. **No mission-group attribute.** The export carries the university
   name per row (the existing `company` field); the researchers'
   sheet derives the group. If the app ever needs mission-group
   banding for its own Compare/Track figures, it derives it the same
   way — from university name against the dated 2026 snapshot listing
   — never as a second hand-maintained facet.

## Alternatives considered

- **Keep 4 Functions and map Governance into Operations** — rejected:
  the researchers count 15 cells "everywhere"; a silent 12-cell app
  would disagree with every manual number they produce.
- **Let the classifier emit Cross-cutting** (it fits the embedding
  model's "low similarity to all five" case) — rejected: the
  researchers reserved exactly this call for humans; a tool-assigned
  Cross-cutting would launder classifier uncertainty as a judgement.
- **Mission group as a repurposed size facet** (the 13 Aug version of
  this ADR) — superseded by their derive-from-name design; a second
  hand-set copy of the mapping invites drift, and membership is a
  dated snapshot (their groupings doc carries an explicit currency
  health-warning).

## Consequences

- Tool output becomes directly comparable, cell for cell, with the
  manual coding sheets — the precondition for the pilot's
  tool-verification claim in the DSR paper.
- The Wedding Cake worked example in README/manual/paper changes
  denominator (X/12 → X/15, ADR-0008's ratio note); screenshots for
  the paper should wait for the re-seed.
- Classifier confidence handling matters more: with Cross-cutting
  reserved for humans, low-confidence sections still get a
  best-of-five suggestion and must be visibly uncertain rather than
  silently confident (fail loudly, ADR-0026).
- The `company_size` facet stays as-is (unused for this study) rather
  than being repurposed.
