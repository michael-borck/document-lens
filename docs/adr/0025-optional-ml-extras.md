# ADR-0025: Optional ML via extras, with graceful degradation

**Status:** Accepted
**Repo:** document-analyser (backend)
**Date:** 2026-05-08 → 2026-06-13
**Evidence:** `410c5fe` (full ML capability, 0.3.0), `9f5badd` (declare runtime deps; mark heavy ML tests slow, 0.2.0), `3050731` / `896818e` (optional embedding via lens-embed — "proof-of-shape for the family", 0.8.0); `document_analyser/analyzers/embedding.py` (guarded import)

## Context

The backend spans light work (text extraction, readability, regex counts) and
heavy ML (sentence-transformers, spaCy, transformers, torch — and, later,
family embeddings via `lens-embed`). Loading the whole ML stack in one Python
process is brittle on macOS, and not every deployment needs every capability.

## Decision

Gate ML behind **pip extras** and **degrade gracefully** rather than hard-fail:

- `[nlp]` pulls sentence-transformers/spaCy/transformers/torch; the desktop
  binaries install it so classification / anomalies / synonyms work in
  production.
- `[embeddings]` pulls `lens-embed` for the family's shared document vector.
- **Analyzers degrade to `None` when their extra is absent** — the guarded
  import pattern: `try: from lens_embed import …  except ImportError: return
  None`. The rest of the API keeps working without the optional capability.
- Heavy ML tests are marked *slow* so the fast suite stays fast.

## Alternatives considered

- **Require the full ML stack always** — rejected: heavier installs and it
  couples every deployment to the brittle full stack.
- **Hard-fail when an extra is missing** — rejected in favour of graceful `None`
  degradation, so a partial install still serves what it can.

## Consequences

- The API is usable at several capability tiers; the desktop app ships the full
  tier.
- "Optional capability returns None" is a contract analyzers and callers rely on.
- **But** silence is only acceptable for *optional* capabilities — a capability
  the deployment *does* include must fail loudly if it can't load (ADR-0026).
