# ADR-0018: Terminology is a durable design decision (Lens → Axis, Focus → Lens)

**Status:** Accepted
**Date:** 2026-01 → 2026-06
**Evidence:** `37335fc` (Themes → Focuses, 2026-01-24), `771958c` (Lens → Axis / Focus → Lens, 2026-06-19), `634ae98` ("5-level Wedding Cake" → "Wedding Cake", 2026-06-17); `CONTEXT.md` as the naming source-of-truth

## Context

As the conceptual model matured, terms collided or misled. Most acutely, "Lens"
was used for two different levels at once (a domain framework *and* an analysis
dimension), which confused users and the code.

## Decision

Treat naming as a first-class, recorded decision. The final three-level model is
**Pattern → Lens (domain framework) → Axis (analysis dimension)**:

- "Themes" → **Focuses** (2026-01).
- "Lens" (dimension) → **Axis**; "Focus" (domain) → **Lens** (2026-06). This
  resolved the two-level "lens" conflict.
- "5-level Wedding Cake Score" → **Wedding Cake Score** (levels are configurable).

**Only the TypeScript/UI layer is renamed. DB columns, JSON keys, and `.lens`
bundle entries keep their historical names** (e.g. the DB still says `lens`) for
backward compatibility; import/seed/wizard match old names too. `CONTEXT.md` is
the single source of truth for current naming.

## Alternatives considered

- **Rename the persisted schema too** — rejected: needless churn and it would
  break existing `.lens` bundles; the display/logic layer is where clarity
  matters.

## Consequences

- User-facing vocabulary is unambiguous; persisted data stays stable.
- Readers of the code must know the TS "Axis" == DB "lens" mapping (documented
  in `CONTEXT.md` and the schema comments).
