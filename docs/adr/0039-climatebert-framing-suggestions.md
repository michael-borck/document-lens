# ADR-0039: ClimateBERT target analyzers as flagged framing suggestions *(backend)*

**Status:** Proposed
**Date:** 2026-10-08
**Deciders:** Michael Borck (with Claude)
**Evidence:** `research-context/coding-legend-v9.md` Axis 1 (Framing 0–3);
`research-context/requirements-digest.md` item 4 (Mike's open question —
"can the tool flag obvious goal-vs-limit cases… as long as the recorded
code is the accepted one"); ADR-0035 (GenAI-last ladder); ADR-0025
(optional ML extras); ADR-0022 (CPU-only torch); ADR-0007 (embedding
classification, pin-per-model-version); ReportParse (Morio et al.,
IJCAI 2024 demo, Apache 2.0) — proof the models work on this exact corpus.
Code lives in the co-developed `document-analyser` repository.

## Context

The v9 legend's Framing axis (0 Silent / 1 Aspirational / 2 Quantified /
3 Limit) is human-coded and must stay that way — it is the researchers'
judgement (ADR-0030 find/judge split). But Mike asked whether the tool can
at least *flag obvious goal-vs-limit cases for humans to confirm or
overturn* (digest item 4, unanswered). Fully manual framing is the pilot's
slowest step; a corpus of 40 universities × 10 years makes it worse.

ReportParse demonstrates that the ClimateBERT family of small, Apache-2.0
transformer models — trained *specifically on climate-related corporate
text* — reliably separates climate commitment from non-commitment and
no-target from reduction/net-zero targets on exactly this document class.
These sit on the **interpretable-ML rung** of ADR-0035's ladder
(deterministic → interpretable ML → generative): fixed models, versioned,
locally runnable on CPU, with per-label confidence — unlike the generative
rung the ladder defers.

## Decision

Add ClimateBERT-family analyzers to `document-analyser` as **optional ML
extras** (ADR-0025 pattern), exposed through the family HTTP contract, and
used **only as flagged, per-passage suggestions** — never as recorded
framework codes.

Minimal model set (pinned by revision, ADR-0007 precedent):

- `climatebert/distilroberta-base-climate-detector` — cheap gate: skip
  blocks with no climate content before costlier analyzers run.
- `climatebert/distilroberta-base-climate-commitment` — commitment vs not;
  feeds a **Relevance/Framing-worthy** hint.
- `climatebert/netzero-reduction` — no-target / reduction-target /
  net-zero; the strongest available signal for **Aspirational vs
  Quantified** suggestion.

Deferred: `climate-sentiment` (Gap already has SST-2 + counter polarity),
`transition-physical` risk classes (no consumer in the app today).

Rules that keep this inside the methodology:

1. **Rung order respected.** A deterministic pre-pass runs first where it
   suffices — number + date regex settles obvious `Quantified` cases at
   rung 0; ClimateBERT handles only the semantic remainder (commitment
   present, target absent or implicit).
2. **Suggestions, not codes.** Suggestions carry
   `{model, revision, score, span}` provenance and render as *flagged AI/
   ML suggestions* in the app; the recorded Framing value is always the
   human's accepted one. Nothing suggestions produce enters coverage,
   scores, or exports as evidence.
3. **Suggestions are auditable.** Every suggestion can be traced to its
   passage span (the same concordance/suppression machinery as keyword
   spans); researchers confirm or dismiss per passage, and dismissals are
   kept, not deleted.
4. **Offline and CPU-bound.** Models download on first use (like the
   embedding model), run CPU-only (ADR-0022), and are version-pinned so
   reruns are reproducible per revision.
5. **Graceful absence.** Without the ML extras installed, the backend
   serves everything else; the app surfaces "framing suggestions
   unavailable" the way it already surfaces backend health — non-fatal
   (family contract: `GET /health` reports analyzer availability).

## Alternatives considered

- **Stay fully manual** — rejected: digest item 4 is an explicit ask, and
  the cost scales linearly with corpus size.
- **LLM/BYOK framing suggestions now** — rejected for this purpose: the
  generative rung is last on the ladder (ADR-0035); it is nondeterministic,
  per-token costly, and harder to pin. Revisit only if the deterministic +
  ClimateBERT rungs measurably fail on goal-vs-limit cases.
- **Pure regex heuristics for all framing** — rejected as *sufficient* but
  adopted as the *first* rung: number+date catches "net zero by 2035" but
  not "we are committed to playing our part" (Aspirational) — which is
  precisely the hard, high-volume case.
- **Adopt ReportParse wholesale** — rejected: dormant research code on an
  uninstallable pinned stack; we take its validated *model choices*
  (Apache 2.0) and its heuristic shapes, not its code path.

## Consequences

- Framing coding gets a first-pass accelerator whose accuracy can be
  measured by the calibration protocol (`research-context/calibration-protocol.md`)
  — suggestion precision/recall against the coders' accepted Framing
  values, reported separately from human ICR.
- document-analyser grows three pinned models (~300 MB total on disk when
  the extras are installed) and an analyzer-availability surface in
  `/health`; packaging follows ADR-0025's optional-extras path so the base
  sidecar bundle stays lean.
- A new suggestion surface in the app (likely the Audit workflow or
  per-mention chips) plus the ADR-0038 per-mention annotation store to
  hold `{suggestion, humanDecision}` pairs; schema impact lands with that
  store, not with this ADR.
- Risk: model labels leak into researcher practice as de-facto codes if
  the UI makes accepting too easy. Mitigation: suggestions are always
  individually flagged, batch-accept is forbidden, and the calibration
  report tracks accept-rate — a near-100% accept-rate is a smell, not a
  success.
- Revisit if: calibration shows suggestion precision below the useful
  threshold on university annual reports (the models were trained on
  corporate climate disclosure — adjacent, not identical), or the October
  17-SDG expansion needs non-climate framing that these models cannot see.
