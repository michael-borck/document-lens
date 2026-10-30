# ADR-0044: Boundary-passage candidate generation for calibration sampling *(backend)*

**Status:** Accepted (implementation pending)
**Date:** 2026-10-21
**Deciders:** Michael Borck (with Claude)
**Evidence:** paper repo `05-manuscript/document-lens-dsr.md` §6.3 "Boundary passages"
(amended 2026-10-21, pre-coding); paper repo `04-literature/climate-policy-radar-comparison.md`;
Climate Policy Radar knowledge-graph methodology (evaluation sampling by embedding
similarity to the concept); ADR-0007 (pinned embedding classification); ADR-0041 rule 6
(no training on the pilot's labels); ADR-0042 (calibration analysis is study evidence);
ADR-0039 (family HTTP contract); `CONTEXT.md` (Project Corpus — the one source)

## Context

The §6.3 calibration design has a blind spot the CPR comparison surfaced: a calibration
computed only over the cells the three-coder pass produces tests the instrument on
passages a coder *happened to find*. The recall estimate is capped by coder diligence,
and the ambiguous boundary passages — where both human and instrument agreement are
least assured — go untested because nobody spontaneously encounters them.

CPR's answer, adopted into §6.3 on 2026-10-21 before coding begins: construct the
boundary slice deliberately by sampling passages by embedding similarity to the
concept. Generating that slice requires the embedding models and corpus access that
live in `document-analyser`; per ADR-0042 the selection, labelling and statistics stay
in the study (paper repo), and per the find/judge split the instrument may find but
never judge.

## Decision

Add one capability to `document-analyser`, exposed through the family HTTP contract:

**Boundary-passage candidates.** For a given goal (keyword + accepted synonyms + its
lens-value descriptions) and a project corpus, rank passages by embedding similarity
between the passage and the goal's terms; return the top-*k* passages that contain **no
keyword match for that goal**. The no-match filter is the point: passages already
matching are in the coders' path anyway; the near-miss slice is what no coder would
otherwise meet.

Rules that keep this inside the methodology:

1. **Candidates, never codes.** Output is a coding prompt for humans, carrying spans
   and provenance `{model, revision, score}` (ADR-0007 pinning). Nothing generated
   enters coverage, scores or exports as evidence (DP9).
2. **Study owns selection and statistics.** *k*, any similarity floor, and which
   slices feed which table are study parameters recorded in the paper's
   pre-specification (now in §6.3). The instrument emits; the study decides (ADR-0042).
3. **Export in the coding-sheet shape.** Candidates export in the same per-mention/
   coding-sheet format as ADR-0031/0038 so the paper repo's ICR tool needs no new
   parser.
4. **Not training data.** Boundary candidates and the codings they attract are never
   used to fit or tune a model against the pilot's labels (ADR-0041 rule 6).
5. **Non-fatal and lens-agnostic.** The base embedding model suffices (no ML extras);
   the capability works for any keyword list, so no lens is hardcoded (DP1); absence
   surfaces as a health/capability report, degrading nothing (DP6).

## Alternatives considered

- **Do nothing; sample more random passages** — rejected: random passages are almost
  all negatives, spending scarce coder hours to re-measure the easy ground. Recall
  stays capped.
- **LLM-generated synthetic passages** — rejected: fabricated text is not corpus
  evidence; the slice must come from the corpus under study (DP7 provenance to source).
- **Coders self-flag uncertain passages during the report pass** — rejected as a
  substitute: a coder cannot flag a passage they never encounter, and self-reported
  difficulty is a different signal. Fine as an extra column; useless as the slice.
- **Put the sampling logic in the paper repo's tool** — rejected: it needs the
  embeddings and corpus access that live behind the Project Corpus primitive; moving
  corpus extraction into the study repo would fork the one source (CONTEXT.md) and
  violate the ADR-0042 division it exists to protect.

## Consequences

- `document-analyser` grows one small endpoint: embed, rank, filter by no-match,
  return spans. CPU-bound, deterministic per pinned revision, no new model downloads.
- The study's pre-specification now names *k* and the similarity floor; those values
  belong in §6.3 when the run is configured, not in the backend.
- No schema change expected: candidates are computed on demand; any caching follows
  existing span-caching patterns.
- Risk: the near-miss slice may be dominated by low-interest passages (near-misses of
  near-misses). Mitigated by small *k* and by §6.3 reporting the slice separately.
- Closes the OPEN-THREADS entry "CPR-style passage sampling for the calibration run"
  (decided 2026-10-21; implementation tracked here).
