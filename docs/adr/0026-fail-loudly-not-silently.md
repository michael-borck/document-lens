# ADR-0026: Fail loudly on ML unavailability, not silently

**Status:** Accepted
**Repo:** document-analyser (backend)
**Date:** 2026-05-08 → 2026-07-08
**Evidence:** `4fdb654` "fix(domain_mapper): raise on model load failure instead of silent total_sections=0"; `d9d5612` / `df44992` (readability survives missing NLTK data; `/health` reports embedding-model state); `78fec55` (macOS `/semantic/sentiment` SIGBUS fix)

## Context

ML capabilities that a deployment *does* include can still fail at runtime
(missing bundled weights, a missing NLTK corpus, memory pressure, a platform
crash). An early bug had the domain mapper **silently return `total_sections=0`**
when its model failed to load — which masked test pollution and made a
clean-machine "classifies nothing" failure nearly undiagnosable. This is the
counterpart to ADR-0025: *optional* capabilities degrade to `None`, but an
*included* capability that breaks must be visible.

## Decision

- **Raise loudly on model-load failure** — `domain_mapper.analyze` raises a
  `RuntimeError` instead of silently returning empty results; the batch route
  surfaces it as a 500, and the desktop client turns that into an actionable
  "restart the engine" message rather than "0 of N classified".
- **Report readiness on `/health`** — `/health` exposes
  `embedding_model_loaded` / `embedding_model_error`, so the app can distinguish
  "healthy but model dead" from "healthy".
- **Don't let a soft signal abort a hard one** — readability *survives* missing
  NLTK data (guards `textstat`, degrades to fallback metrics) so a missing
  `cmudict` corpus can't abort text extraction.
- **Fix platform-specific ML crashes at the source** — e.g. the macOS
  `/semantic/sentiment` SIGBUS, with the root cause documented.

## Alternatives considered

- **Silently return empty/zero on failure** — rejected: it hid a real, recurring
  clean-machine bug and corrupted results without warning.

## Consequences

- Failures are diagnosable and actionable; the desktop app can guide the user.
- The invariant is explicit: *optional-absent → `None`* (ADR-0025);
  *included-but-broken → raise + report*.
