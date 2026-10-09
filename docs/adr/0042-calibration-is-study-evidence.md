# ADR-0042: Calibration analysis is study evidence, not part of the instrument

**Status:** Accepted — amended 2026-10-09 (x2). Rule 4 closed; the TypeScript harness named
below was retired, so the analysis has a single implementation. The body is left as written on
2026-10-08, with two amendments appended.
**Date:** 2026-10-08
**Deciders:** Michael Borck
**Evidence:** ADR-0038 (the legend ships as data, and nothing may exist only to serve it);
ADR-0031 (per-mention export is the calibration surface);
`scripts/calibrate.mjs` + `src/services/_shared/krippendorff.ts` (commit `df70ff7`, both since
deleted — see the second amendment; the TS ordinal metric also had a defect, fixed in `ea9e183`
immediately before its removal);
`../../../research/dsr-document-lens/03-data/agreement/` (the tool's new home);
`../../../research/dsr-document-lens/03-data/agreement-analysis-design.md`;
paper §6.3 and §6.4.

## Context

Calibration measures the instrument against human coding, and it exists only for one study. It
reads spreadsheets the researchers produced, computes Krippendorff's alpha per axis, compares the
instrument's signals with human consensus, and emits six tables. It never talks to the application:
no Library, no corpus, no API.

That last fact is what makes the placement decision, and it cuts against the obvious one. A
calibration harness looks like product tooling — it is a script that reads the export format and
produces numbers — and the first instinct was to keep it beside the export code. That instinct is
wrong for three reasons.

*It would fork the methodology, which is the one thing ADR-0038 forbids.* The rule is that nothing
may exist only to serve the coding legend. An analysis pipeline whose inputs are three coders'
spreadsheets and whose outputs are three tables for one paper is exactly that, and placing it in the
product repo makes "this file exists because of this study" a structural fact rather than a
convention.

*It would import a second toolchain into a single-toolchain repo.* The application is TypeScript and
Rust; the analysis backend is a separate Python package in a separate repository. A Python
environment with a 7.2 GB resolved tree belongs to one repository, not two.

*The audit trail belongs with the claim.* §6.4 of the paper claims every reported number can be
recomputed outside the application from the CSV exports. That claim is about the *instrument's
outputs*. The analysis code is the evidence for a different claim — that the reported reliability
figures were computed as described — and that evidence belongs in the paper's repository, where the
design note and the results land together.

A second force surfaced while building this: a TypeScript calibration harness already exists at
`main` (`scripts/calibrate.mjs`, `npm run calibrate`, commit `df70ff7`, with unit-key alignment on
an exact `doc | sdg | passage` triple after whitespace-collapse and lowercasing). It is real,
tested work, and it duplicates the analysis. Two implementations of the same coefficient is itself
a methodology fork, and the choice between them is not a matter of taste — see Consequences.

## Decision

1. **The calibration tool lives in the paper repository**, at `03-data/agreement/`, and is not part
   of the instrument. It reads a codebook definition, ingests coding sheets, matches passages across
   coders, computes reliability, and emits the paper's tables.
2. **Nothing in the application imports it or depends on it.** The one-way dependency runs from the
   paper to the export format (ADR-0031), never the reverse.
3. **The tool is generic; a study is a codebook file.** The v9 legend is
   `agreement/study-v9.toml`; the statistics and the matcher contain no domain knowledge at all. A
   different codebook — different axes, categories, column names, header row, tab, and grain — is a
   new TOML file and no code change. `tests/test_generic.py` reads a deliberately unrelated
   two-coder sentiment codebook to keep that true.
4. **`npm run calibrate` is superseded, not deleted in this pass.** Retirement happens once the
   Python tool has produced the study's Tables 5–8 from the real sheets, so no capability is lost
   while the replacement is still unproven on real data.
5. **The instrument is never a fourth coder in any reliability coefficient** (ADR-0041), and the
   per-coder labelled data may not be used to train a predictor that is then scored against those
   same labels (ADR-0041 rule 6).

## Alternatives considered

- **Keep calibration in the product repo beside the export code** — rejected. It puts study
  scaffolding inside the artefact, adds a second toolchain to a single-toolchain repository, and
  splits the audit trail for §6.3 away from the results it supports.
- **A third repository for study tooling** — rejected as premature. One study needs one tool; a
  shared research-tools repository is worth creating when the second unrelated consumer exists, not
  before.
- **Keep the TypeScript harness as canonical and port nothing** — rejected on a mechanism, not a
  preference. `norm()` in `calibrate.mjs` collapses whitespace and lowercases, then the unit key is
  an exact string match. A coder who drops a leading clause, appends "(continued overleaf)", or
  pastes curly quotes produces a different key, and the unit splits. That failure is invisible: it
  lowers the unit count, which makes reliability look worse, and no error is raised. Containment-
  gated matching (one coder's text a drop or an addition of the other's, never a different set of
  content words) is the mechanism that resists it. This is an empirical claim about hand-pasted
  rows and is settled by running both against the three real sheets, not by argument.
- **Delete the TypeScript harness now** — rejected for now under rule 4. It is pushed, tested work
  and there is a real risk the Python replacement has not yet produced the study's tables.

## Consequences

- The application repository stays TypeScript and Rust, and its `scripts/` directory keeps holding
  only things the application runs.
- `npm run calibrate` stops being the study's entry point once the Python tool lands its tables.
  Until then both exist and the overlap is real; rule 4 exists to bound that, not to justify it.
- The two implementations differ in a way that matters and is not yet measured: exact unit-key
  matching against containment-gated matching. Running both over the same three sheets and comparing
  unit counts per axis settles which one to keep, and that comparison should be run before anything
  is deleted.
- The codebook-as-data discipline now applies twice: the researchers' legend ships into the app as
  seed data (ADR-0038), and each study's codebook ships into the analysis as a TOML file. A v10
  legend is a data edit in both places, and neither is a release.
- `uv.lock` is committed so the analysis environment is reproducible; the environment itself is
  not. A third party auditing §6.3 recreates it from the lock file.
- Revisit if: the study produces its tables from the Python tool and the TypeScript harness is
  retired (close rule 4); or a second study needs the analysis, at which point it graduates to its
  own repository (reconsider alternative 2).
---

## Amendment 2026-10-09: the duplication is half-resolved, and one metric was wrong

The Context section says the two implementations "differ in a way that matters and is not yet
measured" and that the difference is exact unit-key matching against containment-gated matching.
That was too narrow, and it deferred a comparison that did not need the coding sheets.

**The statistic was comparable without any data.** Krippendorff's α is a pure function of already
aligned units. The real sheets were never needed to compare the two α implementations, only to
compare the two alignment strategies. Measured against the independent `krippendorff` package on
three-coder data where coders disagree by at most one scale step (the Framing shape):

| adjacent-disagreement rate | reference | this repo's Python | `npm run calibrate` | TS error |
|---|---|---|---|---|
| 0.05 | 0.966859 | 0.966859 | 0.935941 | −0.031 |
| 0.20 | 0.861691 | 0.861691 | 0.744481 | −0.117 |
| 0.40 | 0.749383 | 0.749383 | 0.568047 | −0.181 |

The **nominal** metric agrees exactly across all three implementations, to floating-point identity.
The **ordinal** metric does not. `src/services/_shared/krippendorff.ts` is missing the square in
`ordinalDistance`: it returns a normalised trapezoidal midpoint sum, whereas Krippendorff's ordinal
metric uses `(Σ n_g − (n_lo + n_hi)/2)²`. Squaring that one expression makes the shipped code match
the reference to the last digit on every case above, which locates the defect exactly.

Consequences, which are worse than the ADR assumed:

- `scripts/calibrate.mjs:204` computes Framing as `metric: 'ordinal'`, so **the ordinal path is
  live**. Framing is the Wedding Cake axis and the one axis the paper's argument turns on.
- The error grows with disagreement and always understates reliability — it makes the tool look
  *less* reliable, so it is not self-serving, but it is not Krippendorff's α either. §6.3 reports a
  statistic by that name; a number produced this way will not reproduce against Krippendorff (2011)
  or against any published value, and the divergence is largest exactly where a reader would be
  most inclined to trust the figure.
- The ordinal tests did not catch it because both assert only relative properties: one requires
  ordinal > nominal (any monotonic discount satisfies it) and one asserts ordinal == nominal on a
  hand-picked uniform-disagreement case (true of many metrics). Neither pins an absolute value.
  Relative property tests were substituted for the golden-value test that this metric needs.

Amended rules:

- **Rule 4 is narrowed.** The statistic is no longer an open question: the Python implementation is
  the only one that computes Krippendorff's ordinal α correctly, so α ownership is settled and
  `src/services/_shared/krippendorff.ts` must not be used to produce any reported figure. What
  genuinely still needs the three sheets is the *alignment* comparison — unit counts per axis under
  exact matching versus containment gating. That comparison is still required before the harness is
  deleted, and it is a comparison about matching, not about statistics.
- **The missing square is a defect to fix, not only a reason to retire.** Retirement by
  supersession would leave `npm run calibrate` reachable and silently wrong on the ordinal axis. A
  one-line correction plus a golden-value ordinal test against Krippendorff's published worked
  example makes the shipped path safe to run in the interim, whatever the alignment comparison
  concludes. Fixing it does not prejudge rule 4.
- **Moving the harness into the paper repository is rejected.** It would import Node into a
  Python-and-bash repository to preserve a duplication that has just been shown to be a bug, not a
  design choice. The comparison runs where Node already is, in this repository, and the harness
  leaves with its replacement.

Rule 5 and ADR-0041 are unaffected.

---

## Amendment 2026-10-09 (second): rule 4 closed, harness retired

Retirement happened earlier than rule 4 anticipated, and the reason is that the precondition it was
waiting on turned out not to be a precondition.

Rule 4 deferred deletion until the Python tool had produced the study's Tables 5–8 from the real
sheets, so that no capability would be lost while the replacement was unproven on real data. But the
capability at risk was only ever the *statistic*, and the statistic had already been settled two
commits earlier: after restoring the missing square, the two implementations agree exactly across
120 randomised three-coder cases at both measurement levels. Deleting the harness therefore removes
a duplicate, not a capability.

The alignment comparison that rule 4 exists to protect is unaffected. It was never a TS-versus-
Python question; it is a question about two policies, and both are reachable from the Python tool
alone, because `MatchSettings.threshold` selects between them — 1.0 leaves only the exact-key path,
0.92 (the default) adds the containment-gated fallback. The deleted harness's own weakness is
reproducible there as the thing it was: on a passage differing only by a dropped leading clause and
curly quotes, `normalise_passage` folds the quotes and leaves the two coders' token signatures
identical (similarity 0.9914, containment true), where the harness's `norm()` would have produced two
unit keys. So the comparison ADR-0042 requires can be run, and it will be run, from one repository.

Removed: `scripts/calibrate.mjs` (341 lines), `scripts/lib/xlsx.mjs` (185 lines),
`src/services/_shared/krippendorff.ts` and its test, and the `npm run calibrate` entry.

`scripts/lib/xlsx.mjs` went with it. It existed only to read the coding sheets for this harness —
nothing else imported it, and the Python tool reads xlsx through `openpyxl`. It was a
zero-dependency ZIP-and-XML reader, which is real work, but it is work for a script that no longer
exists and its replacement already has a reader. Worth remembering as available prior art if a
future script needs to read xlsx without adding a dependency.

`research-context/calibration-protocol.md` stays. It is the study protocol — what is coded, by whom,
and what is compared — and it is still the document that says so. Only the implementation moved.

Rule 4 is now closed. The Python tool in the paper repository is the single implementation.
