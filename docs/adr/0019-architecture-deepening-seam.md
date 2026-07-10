# ADR-0019: Architecture deepening — data seam, Project Corpus, Score Evaluator registry

**Status:** Accepted
**Date:** 2026-05-23
**Evidence:** `ba419cf` "deepen architecture — data seam, corpus, score evaluator, run-lifecycle"; `c8eb0f9` (adopt run-lifecycle); tests grow 12 → 44; `CONTEXT.md` "Score Evaluator" / "Rule Evaluator Registry" / "Evaluation Trace"

## Context

After the security cutover to a keyed query registry (ADR-0015), ~20 analysis
services were still untestable (they reached the DB via IPC, which needs
Electron). The Wedding Cake math was **triplicated** across Track, Compare, and
Score, so the three views could disagree. Per-view "load documents + count
matches" preludes had drifted apart.

## Decision

Introduce four seams so the analysis layer is testable and reconciles by
construction:

1. **Swappable `DbDriver`** — extract pure DDL to `electron/schema.ts` and put a
   driver behind `db.ts`: IPC in production, an in-memory `node:sqlite` running
   the *same* Query Registry in tests. Services become unit-testable.
2. **`loadProjectCorpus`** — one load-and-count primitive every view uses, so
   Coverage/Compare/Track/Score reconcile by construction (not by coincidence).
3. **Score Evaluator** — a pure scoring core + a **Rule Evaluator Registry**
   keyed by rule type, and a generic `evaluateScore` that returns an
   **Evaluation Trace** (the renderable "why this score"). One place for the
   math; Track/Compare/Score consume it.
4. **`useAnalysis` run-lifecycle hook** — cancel-safe run-ids, a standard
   PolaritySelector, and a per-session ML caveat banner.

## Alternatives considered

- **Keep IPC-only data access** — rejected: made the analysis layer untestable.
- **Duplicated math per view** — the status quo; rejected as a correctness risk.

## Consequences

- Tests roughly quadrupled; the analysis engine is now unit-tested off-Electron.
- New analysis (e.g. substance signals, ADR-0011; scoring generalisation,
  ADR-0008) plugs into these seams rather than re-deriving them.
