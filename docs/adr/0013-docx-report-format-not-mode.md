# ADR-0013: The DOCX report is a format with three scopes, not a mode

**Status:** Accepted
**Date:** 2026-07-09
**Evidence:** `7e0e3a3` (full-project DOCX report), `5f69e10` (embed ranked charts); `src/services/report-export.ts`, `src/services/_shared/svg-chart.ts`; `docs/design/focus-auto-research-mode.md` ("DOCX report: a format, not a mode")

## Context

There was confusion about how a downloadable Word report relates to the
exploratory workflow and the (proposed) Focus mode — "is the report a mode?".

## Decision

The DOCX report is a **format (a container)**, not a mode. What it contains is
decided by **where it is invoked from** — three scopes over **one assembler**:

1. **This view** — the current chart + its data (small; per-view export).
2. **Full project report** — everything, deterministic (inventory, X/4+X/12
   scores, substance signals; charts built as SVG → PNG and embedded). This is
   the reusable assembler.
3. **Focus report** — the same assembler pointed at a **ranked subset** (+
   optional flagged AI), for Focus mode (ADR-0012).

Charts are built **deterministically as SVG directly from the data** (not by
snapshotting rendered recharts), then rasterised for embedding — reproducible and
unit-testable. The report **reuses the on-screen analysis services**, so it is a
container, not a new analysis.

## Alternatives considered

- **Snapshot rendered recharts off-screen** — rejected as timing-fragile; build
  the chart SVG from data instead.
- **Tie the report to Focus mode** — rejected: the report is a format usable from
  exploratory views too.

## Consequences

- Build order: full-project report first (the engine), then per-view, then the
  Focus report.
- Adds a `docx` dependency (pure-JS). Chart-per-view capture for the "this view"
  scope is future work.
