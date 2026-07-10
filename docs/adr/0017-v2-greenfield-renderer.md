# ADR-0017: v2 greenfield rewrite of the renderer around a new Information Architecture

**Status:** Accepted
**Date:** 2026-05-11
**Evidence:** `21bfc6d` "feat(v2)!: Phase 1 — wipe v1 src; rebuild shell from new IA; bump 0.13.0"; `bbc4c2d` / `666e4cc` / `5aad3a6` (IA v2); `docs/design/information-architecture.md`

## Context

The v1 renderer was built around a project/document/search/ngrams/profile shape
with a single-axis keyword model. It could not express the multi-axis tag model
(ADR-0005), the Wedding Cake scoring methodology (ADR-0008), or the "one
question, one page" IA the research demanded.

## Decision

**Wipe ~46 v1 renderer source files and rebuild the shell from the v2
Information Architecture** — 6 top-level pages + 9 workflow tabs, each answering
a single plainly-worded question. Keep only the stable substrate: the `electron/`
main-process code, the shadcn UI primitives, and the HTTP API client. Marked a
BREAKING change (0.13.0).

## Alternatives considered

- **Incrementally refactor v1** — rejected: the data model and navigation were
  wrong at the root; incremental change would carry the wrong abstractions
  forward.

## Consequences

- A clean surface aligned to the methodology; the IA doc became the design
  source-of-truth (`docs/design/information-architecture.md`).
- A one-time throw-away of v1 UI work — acceptable pre-release with no users.
- Enabled the greenfield DB (ADR-0004) and the deepened data seam (ADR-0019).
