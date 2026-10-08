# ADR-0042: Calibration analysis is study evidence, not part of the instrument

**Status:** Accepted
**Date:** 2026-10-08
**Deciders:** Michael Borck
**Evidence:** ADR-0038 (the legend ships as data, and nothing may exist only to serve it);
ADR-0031 (per-mention export is the calibration surface);
`scripts/calibrate.mjs` + `src/services/_shared/krippendorff.ts` (commit `df70ff7`);
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