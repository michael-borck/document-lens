# ADR-0007: Section classification via sentence embeddings, not an LLM

**Status:** Accepted
**Date:** 2026-05-12 (semantic backend modules 2026-01-13)
**Evidence:** `information-architecture.md:673-692` (IA-1); `ec73822` (section detection + Function classification pipeline; `src/services/sections.ts`); backend `/semantic/domain-mapping/batch`; `e814662` (semantic modules)

## Context

Document-context axes (ADR-0005) require assigning each section of a document a
value (e.g. a Function). The method must be **deterministic** (reproducible for
research), **cheap** (hundreds of long, varied-format annual reports), and free
of per-call cost or network dependence (ADR-0001).

## Decision

Classify sections by **cosine similarity between sentence embeddings** of the
section text and of each axis-value's description (backend
`/semantic/domain-mapping/batch`, `all-MiniLM-L6-v2`). Assign the highest-
similarity value. Detect sections **client-side at paragraph grain** (split on
blank lines, drop <80-char fragments, split >4000-char paragraphs at sentence
boundaries), each carrying `[start,end)` offsets so a keyword-match offset joins
to its section.

## Alternatives considered

- **LLM inference per section** — rejected: non-deterministic and costly;
  incompatible with the offline default. Allowed *later* as an optional,
  clearly-flagged upgrade (see ADR-0014).
- **Section-heading heuristics** — rejected as brittle across report formats.
- **Backend header-bounded sections** — too coarse; a header-bounded section
  often spans multiple Functions, so paragraph-grain is used instead.

## Consequences

- Classification is reproducible per model version and runs offline.
- Requires a "classify" step (cached) before the 2D matrix / full Wedding Cake
  score are available; the UI gates on classification status and falls back to a
  1D prerequisite score meanwhile (ADR-0008).
- Embedding-model load failure must be surfaced, not silent — the backend raises
  loudly and `/health` reports model readiness.
