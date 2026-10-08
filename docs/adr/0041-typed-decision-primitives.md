# ADR-0041: Typed decision primitives for the judgement axes — adopt the pattern, not a vendor

**Status:** Accepted (decided in principle; the comparison harness is the follow-on work)
**Date:** 2026-10-08
**Deciders:** Michael Borck
**Evidence:** `research-context/requirements-digest.md` item 4 (Mike's framing-first-pass ask);
`research-context/coding-legend-v9.md` Axis 1 (Framing 0-3, the arrow test);
ADR-0030 (find/judge split); ADR-0035 (method ladder); ADR-0039 (ClimateBERT framing
suggestions); ADR-0038 (legend as seed data); `research-context/calibration-protocol.md`
(three coders, settled/contested cells, human ceiling as the accuracy target);
`src-tauri/src/db_generated.rs` — `mention_suggestions` and `mention_annotations` tables.

## Context

Three human coders are about to apply the v9 coding instrument to the same two or three 2025
annual reports. That produces, for the first time, a labelled corpus of human judgements on real
passages: a few hundred coded cells per axis. Two questions follow, and they are different.

*Can the instrument fill in the judgement axes faster?* Framing is the pilot's slowest step by
the researchers' own account, and Mike's digest item 4 asked whether the tool could at least
*flag* obvious goal-versus-limit cases. ADR-0039 answers that with pinned climate-domain
classifiers and deterministic number-and-date rules. Those give per-label scores from
purpose-trained binary models. They do not give a probability distribution over the four framing
levels, so they cannot say how close a call was, and a researcher cannot tell "probably
Aspirational" from "confidently Aspirational".

*Should something be trained on the labels this study produces?* ADR-0035 already anticipated
it and constrained it: tree-first, interpretable, suggestion-only. But the corpus is now about to
exist, and the question deserves a recorded answer rather than an assumption.

Alongside both sits a family of models called "System One" (the hosted product is TypeSafe's
*Jev*, with several independent local reimplementations — LocalJev, local-jev, OpenSourceJev).
The pattern is that a model is asked a typed question over a declared candidate set, and the
answer is read from the **next-token logits** of the answer itself, softmaxed over the allowed
options, instead of generating prose or JSON to be parsed. Four properties follow from that:
the answer is type-safe by construction, because only the declared options can score; the output
is a real probability distribution rather than a self-reported confidence string; it is
deterministic, since it is one forward pass with no sampling; and all questions about a passage
are answered in the same pass, so four framing questions cost roughly one document read.

The mapping onto the legend is close to exact. Framing is an ordered scale, which is the `Score`
primitive. Relevance is `Choice`. Prominence is `Choice`, and already derived deterministically
from layout. Provenance is `Noul`, and is anyway structural — whether a mention sits inside a
mandated disclosure section is a question about position, not meaning.

## Decision

**Adopt the typed-decision pattern as the shape every judgement-axis suggestion must take. Do not
adopt a hosted model. Do not train on the pilot's labels and score against them.**

1. **Each judgement axis becomes a declared question with a declared candidate set.** The
   candidate set is read from the shipped legend data (ADR-0038), not hard-coded, so a v10 legend
   with a fifth framing level needs no code. Framing uses the ordered `Score` shape; relevance,
   domain and prominence use `Choice`; provenance uses `Noul`.
2. **A suggestion must carry a probability distribution over the declared candidates, not a
   single label with a self-reported confidence.** This is the substantive change from ADR-0039.
   Where a purpose-trained classifier gives one score per label, the typed read gives the whole
   distribution, so "1 versus 2" becomes a graded quantity rather than two independent guesses.
   Probabilities are stored per suggestion with the model id and revision, so a later calibration
   study has something to fit.
3. **Local execution only.** A hosted System One endpoint would break DP5 and the reproducibility
   claim in §6.4 of the paper: the reported number must stay recomputable on the researcher's own
   machine. This makes the local reimplementations admissible and the hosted API not, and it is the
   same reasoning as ADR-0014 on BYOK.
4. **This is rung 1, not rung 2.** A logits read emits no text. It produces a distribution over a
   declared set, so it belongs on the interpretable-ML rung of ADR-0035, alongside ADR-0039's
   classifiers and above the deterministic rules. It does not breach the generative rung because
   nothing is generated. Two operational rules follow: a reasoning/"thinking" model is
   inadmissible, because it spends its first tokens in a hidden channel and leaves no answer token
   to read; and any local implementation must read logits rather than asking a model to write
   JSON, or we are back to parsing fragile text.
5. **A suggestion is never a recorded code.** Unchanged from ADR-0030 and ADR-0039. Accepting a
   suggestion writes the *human's* value into `mention_annotations` with
   `source='rule-suggested-accepted'`, and the suggestion row is kept. Batch-accept stays
   forbidden, and the accept rate stays tracked.
6. **Never train on the pilot's labels in order to score against them.** This is the part that
   makes the study worth running, so it is stated as a prohibition rather than a preference.
   Three independent reasons, any one of which is sufficient:
   - *Circularity.* A model fitted to the coders' labels and then scored against those same
     labels measures training-set fit. The number would look good and mean nothing.
   - *The targets are not gold.* They are three coders whose reliability this same study is
     computing. Training on labels of unknown reliability inherits that uncertainty and then
     hides it.
   - *Leakage by construction.* All three coders read the same passages, so a random train/test
     split puts text the model has already memorised into the test set. Any split must be by
     passage, and the training target should be the settled consensus cells rather than one
     coder.
7. **What the corpus can support.** A few hundred cells per axis fits a decision tree whose splits
   can be read. It does not fit a small neural network or an adapted language model. Tree-first,
   held-out by passage, scored against the same settled cells — this is the only learned
   component the current corpus licenses, and it is deferred until a later corpus exists.
8. **The deliverable from this corpus is a comparison, not a model.** The right output is one
   table ranking candidate predictors — deterministic rules, ADR-0039's classifiers, and a local
   logits read — on the same passages against the same human consensus, with calibration measured
   *on this corpus*. Published calibration figures for the local implementations were fitted on
   BoolQ, and independent measurement of the hosted model found it well calibrated on one dataset
   and overconfident on another. The only calibration number that matters is the one from our data.

## Alternatives considered

- **Add the instrument as a fourth coder in the inter-coder coefficient** — rejected, and
  separately so in the paper. Krippendorff's alpha assumes exchangeable observers. The
  document-context axis descriptions are the researchers' legend reproduced verbatim, so the
  instrument and the coders read the same codebook by the same author; a dependent observer
  inflates the apparent reliability of the codebook without testing human agreement. The
  instrument is reported against the human consensus instead, side by side with the human-human
  rate.
- **Fine-tune a model on the pilot labels and report its agreement** — rejected under rule 6.
  This is the option that looks most attractive and is worth least.
- **Use the hosted System One API** — rejected under rule 3. It would make every framing
  suggestion a network call, put report text off the researcher's machine, and make a reported
  number depend on a vendor's serving stack. The paper's local-first and recomputability claims
  would not survive it.
- **Replace ADR-0039's classifiers with the logits read** — rejected for now. The two are not
  obviously comparable on accuracy: the ClimateBERT family was trained on climate disclosure
  text, which is adjacent to this corpus, whereas a general instruct model is not. The honest
  position is to measure both on the same passages and keep whichever wins, which rule 8
  requires anyway.
- **Train on a larger external corpus instead of ours** — not rejected, just not this study. It
  would break the train/test leakage that rule 6 forbids on our data, but it cannot validate
  against our coders' reading of *these* passages, so it could only inform a default, never a
  recorded code.

## Consequences

- Every suggestion now carries a distribution, so the app can show a coder "1 Aspirational
  (0.62) / 2 Quantified (0.31)" instead of a bare label. That is the affordance the researchers
  asked for, and it makes "which of these calls are close?" answerable rather than a matter of
  opinion.
- Calibration becomes measurable rather than assumed, and it becomes *our* measurement: the
  study can report whether a pinned model's stated probabilities mean anything on university
  annual reports, which is the honest form of the claim.
- The pilot ships **no new learned model.** This ADR is a shape decision plus a prohibition; the
  only new work it licenses is a comparison harness over data we are about to have.
- The framing axis stays the hard case, and this ADR does not fix that. "3 Limit" is the rare
  category the goal-versus-limit distinction turns on, and it is the category every reported
  benchmark is weakest on. If the corpus contains very few Limit rows, the honest report is that
  the axis was barely exercised, not a coefficient over a scale the corpus does not reach.
- Dependency risk is real and is why rule 3 says local-only rather than "prefer local": a local
  System One implementation is young, and its own benchmark numbers span roughly 54% to 93%
  depending on model and tier. Pin the implementation and the weights by revision, exactly as
  ADR-0039 pins its models, or the reproducibility claim lapses.
- Revisit if: the corpus grows past roughly two thousand settled cells per axis, which would
  license a tree or a small model trained on our labels and evaluated on held-out passages; or a
  framing suggestion proves materially better than the rules at rung 0, which would justify
  promoting it; or a System One implementation reaches parity with the purpose-trained
  classifiers at a fraction of the download size.