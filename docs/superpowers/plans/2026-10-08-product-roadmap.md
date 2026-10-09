# Product Roadmap — iterative plan forward

**Date:** 2026-10-08
**Mode:** iterative improvement — no external deadline; waves land by
dependency, not by date.
**Vocabulary:** [`CONTEXT.md`](../../../CONTEXT.md); decisions live in the
[ADR index](../../adr/README.md).

## Where the ADRs stand (2026-10-08 audit)

| ADR | Decision | Status | Roadmap position |
|---|---|---|---|
| 0031 | Per-mention validation export | Accepted (implemented) | done |
| 0033 | Five delivery Functions | Accepted (implemented) | done |
| 0037 | Per-keyword match mode | Accepted (implemented) | done |
| **0038** | v9 Coding Legend as seed data | Proposed | **Wave 1 — keystone** |
| 0034 | Framework-invocation terms | Proposed | lands *inside* Wave 1 |
| **0040** | Layout pass → prominence zones | Proposed | **Wave 2** (supersedes 0032's deferral) |
| 0032 | Two-zone prominence | Proposed | accepted-by-Wave-2 |
| **0039** | ClimateBERT framing suggestions | Proposed | **Wave 3** (needs 0038's annotation store) |
| 0028 | Synthetic test corpus | Proposed | Wave 1.5 — validation harness for Waves 2–3 |
| 0027 | Image text (OCR/captions) | Proposed (phase 2) | Wave 4+ |
| 0036 | Windows signing | Accepted (dormant CI) | back pocket |

Dependency spine: **0038 → 0039**, **0040 → 0032**, **0038 → calibration
study**, **0028 validates 0040 + 0038**.

---

## Wave 1 — Legend as data (ADR-0038 → Accepted)

The keystone: everything else (framing suggestions, calibration) reads the
researchers' methodology from seed data instead of bespoke code.

1. Seed the v9 legend through existing seams:
   - SDG **search stems** as keywords — prefix match mode where the legend
     types a stem (ADR-0037 pays off here)
   - **Countervailing** list as counter-polarity keywords (ADR-0006);
     SDG 13/7 share the climate counter-list
   - **Framework invocations** as a separate invocation-terms list counted
     apart from boundary hits (ADR-0034 accepted + implemented here)
   - **Function lens** value descriptions updated to the legend's v9
     boundary tests (Research / Engagement / Teaching / Operations /
     Governance; Cross-cutting stays human-only)
2. Relevance gate stays exclusion-phrases + span suppression; False
   positives kept for audit.
3. Per-mention **annotation store** (0038's one new primitive):
   `{documentId, startOffset, endOffset, keywordId, axis, humanValue,
   suggestion?}` — general, span-addressed, workflow-agnostic. Framing /
   Prominence / Provenance codes land here when humans record them.
4. Schema bump; `npm run gen:rust-db`; seed-semantics note.
5. Close the documented v1 gap while in the area: synonym discovery
   suggests single-word inflections, not just corpus n-grams.

**Verification:** seeding idempotence, prefix-mode stems matching the
legend's own examples, unit tests per seam; the Wedding Cake path still
green on the SDG defaults.

## Wave 1.5 — Synthetic corpus (ADR-0028 → Accepted)

Author the in-repo corpus *before* Waves 2–3 need ground truth: ~15–20
fictional reports **with authored VC forewords and known prominence zones**,
hit-keyword prose, and a `corpus-manifest.json` of relative expectations.
This is the measuring stick for Wave 2's zone detection and Wave 3's
suggestion precision — without it, heading thresholds get tuned by vibes.

## Wave 2 — Prominence automation (ADR-0040 + ADR-0032 → Accepted)

1. Backend layout pass (PyMuPDF headings, offset-aligned to
   `extracted_text`) — deterministic, rung 0, non-fatal (0040's decision).
2. `document_headings` table + schema bump; alignment-quality surfaced at
   import.
3. Zone derivation via the fallback rule; mentions inherit zone by offset;
   zone in per-mention export and Compare/Map grouping; manual override.
4. Zone weight (Ldr ×2 / Body ×1) and the Stated-vs-Observed divergence
   signal — computed per document, rendered where the researchers' Delivery
   tab lives in their workflow.

**Verification:** manifest expectations for zone detection on the synthetic
corpus; per-document detection-quality field honest (ADR-0026).

## Wave 3 — Framing suggestions (ADR-0039)

1. Deterministic pre-pass: number + date regex settles obvious
   `Quantified` cases into the annotation store as rung-0 suggestions.
2. ClimateBERT extras (detector → commitment → netzero/reduction) as
   optional, pinned, CPU-only analyzers; `/health` reports availability.
3. Suggestion surface: per-passage flagged chips (Audit workflow or
   Read), confirm/dismiss with dismissals kept, batch-accept forbidden.
4. Calibration hook: suggestion precision/recall vs accepted Framing
   codes, reported separately from human ICR; accept-rate tracked (near
   100% is a smell, not a win).

## Wave 4 — Calibration study (when the three coding sheets land)

Protocol already written: `research-context/calibration-protocol.md`.
Repo side moved. The analysis lives in the paper repository at
`research/dsr-document-lens/03-data/agreement/` — not here — because code
that exists only to serve this study's coding legend must not ship inside
the artefact (ADR-0042). Krippendorff's α per axis is implemented and
cross-validated there; passage matching and the report driver still to
build. The TypeScript `npm run calibrate` harness this roadmap originally
pointed at has been retired.
Step 0 asks (cross-coded subset, codebooks, PDFs) go out whenever the
sheets arrive — the only time-sensitive item in this roadmap.

## Later / opportunistic

- **Typed logits-read suggestions** (ADR-0041). Replace the per-label
  scores from the climate classifiers with a read of the next-token
  distribution over the declared candidate set, so a framing call is
  reported as `1 Aspirational (0.62) / 2 Quantified (0.31)` rather than a
  bare label, and "which of these calls are close?" becomes answerable.
  Blocked on the calibration study: ADR-0041's deliverable is a
  comparison table over the same passages, and this only gets built if it
  wins. Not a swap — measure first, then decide. Local implementation
  only; pin implementation and weights by revision.
- **Per-lens suggestion models** (ADR-0043). Move `MODEL_SPECS` out of
  the analysis service and into an optional capability block in lens
  data, so a lens declares the models it wants or declares none, and a
  domain mismatch yields silence rather than confident nonsense. Known
  cost: until the seed carries the block, the sustainability lens
  produces no suggestions. Cut this seam before opening a second lens.
- **Cached-parse reuse** (ReportParse's `annotator-add` pattern) once
  re-running analyzers across a 40-university corpus is routine.
- **Bboxes in the page model** for jump-to-location precision — piggyback
  on Wave 2's layout pass if cheap, otherwise defer.
- **Climate table/figure heuristics** — with ADR-0027 phase-2 image text.
- 10-years × 40-universities scale work (batch import UX, reprocess).

## Working agreements (unchanged)

The find/judge split (0030) and the GenAI-last ladder (0035) are the
review gate for every wave: rung 0 before ML, ML before generative;
suggestions flagged; the recorded code is always the human's. Each wave
lands with its own tests, schema bump where needed, and ADR status
flipped Proposed → Accepted (implemented).
