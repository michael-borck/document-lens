# ADR-0009: The 2D coverage matrix as the Map's advanced view

**Status:** Accepted
**Date:** 2026-05-12 (matrix), 2026-07-09 (radar + counts/% toggle)
**Evidence:** `89698d4` (Map one-axis), `3d3052e` (two-axis matrix), `8c329b9` (counts/% toggle), `d169181` (radar compare); `src/services/coverage-2d.ts`, `src/pages/workflow/Map.tsx`

## Context

A one-axis distribution can't show how a keyword-attached axis (SDG/Pillar)
cross-tabulates with a document-context axis (Function) — e.g. "which SDGs are
addressed via which core activities?".

## Decision

Add a **two-axis matrix** mode to the Map workflow: rows = keyword-attached axis,
columns = document-context axis; each cell accumulates matches by (section-tag,
keyword-tag), joining a match to its section via binary-search offset lookup. It
**reuses Coverage's match engine** so counts reconcile. The matrix is disabled
when no document-context axis is active, and keeps explicit "unplaced" accounting
(matches with no row tag / no section tag / outside sections). Later additions:
a **Counts / % of total** toggle to tame large raw counts, and a **radar** view
to overlay two documents' single-axis profiles.

## Alternatives considered

- **Only one-axis distributions** — rejected: can't express cross-tabulation.
- **Hiding unplaced matches** — rejected: they're surfaced honestly so the user
  sees how much evidence couldn't be located.

## Consequences

- The matrix cells are exactly the inputs to the full Wedding Cake score
  (ADR-0008), so Map and Score reconcile by construction.
- Requires classification to be run (ADR-0007) before the matrix is meaningful.
