# Traceability matrix — user stories → verification

Maps every user story ([`user-stories.md`](user-stories.md)) to **how it is
verified**. It is the evaluation artefact behind the DSR paper's §7.2 (technical
evaluation — reproducibility and determinism): the deterministic analysis engine
is covered by automated tests; user-facing/UI and non-deterministic (AI) stories
rest on manual acceptance. This document makes that split explicit — including
where verification is *manual only* (the honest gaps).

**We do not target one automated test per story.** A story is a user-facing
behaviour; many stories share one engine, so a single unit test covers the
correctness core of several. The right granularity is: automated tests on the
deterministic core, cross-cutting invariant tests, and *documented manual
acceptance* for UI/flow/AI behaviour.

## Verification legend

- **U — Unit (automated):** a `vitest` service/logic test. Names the file(s).
- **I — Invariant (automated):** a cross-cutting property test — chiefly
  `reconciliation.test.ts` (Coverage/Map/Compare/Score agree) and
  `project-corpus.test.ts` (the shared load-and-count primitive).
- **M — Manual acceptance:** verified by driving the app (UI/UX, full flow,
  file output, or an external dependency). No automated coverage yet.
- **P — Planned e2e:** worth an automated end-to-end test later.

All 24 test files run under `npm test` (`vitest run`); 126 tests as of v0.27.0.

## A. Coverage

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-A-01 which docs discuss the framework | U + I | `coverage.test.ts`, `reconciliation.test.ts` | shipped |
| US-A-02 tier roll-up (keyword ↔ goal ↔ pillar) | U + M | `coverage.test.ts` (axis values); roll-up UI manual | shipped |
| US-A-03 export coverage as CSV/Excel | U + M | `csv.test.ts` (serialisation); file write manual | shipped |
| US-A-04 count accepted synonyms toward parent | U | `keyword-match.test.ts`, `project-corpus.test.ts` | shipped |
| US-A-05 filter by polarity | U | `coverage.test.ts` | shipped |
| US-A-06 filter by axis value | U + M | `coverage.test.ts`; filter UI manual | shipped |

## B. Compare

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-B-01 compare/rank multiple documents | U + I | `compare.test.ts`, `reconciliation.test.ts` | shipped |
| US-B-02 one company × multiple frameworks | — | — | not built (speculative) |
| US-B-03 framework completeness score | U | `compare.test.ts`, `scoring.test.ts` | shipped |
| US-B-04 filter by document attributes | U | `compare.test.ts` | shipped |
| US-B-05 rank by a Scoring Rule | U | `scoring.test.ts`, `wedding-cake.test.ts` | shipped |
| US-B-06 repetition | U | `substance.test.ts` | shipped |
| US-B-07 evidence-reuse | U | `substance.test.ts` | shipped |
| US-B-08 diversity / intensity / coverage-spread | U | `substance.test.ts` | shipped |
| US-B-09 confidence indicator | U | `substance.test.ts` | shipped |
| US-B-10 group/filter by type / size / etc. | U + M | `compare.test.ts` (filter); grouping UI manual | shipped |

## C. Track

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-C-01 single company over years | U | `track.test.ts` | shipped |
| US-C-02 tone–substance gap | U | `gap.test.ts`, `gap-math.test.ts` | shipped |
| US-C-03 overlay multiple companies | U | `track.test.ts` | shipped |
| US-C-04 "year unknown" bucket, never dropped | U | `track.test.ts` | shipped |
| US-C-05 positive-vs-counter over time | U | `track.test.ts` | shipped |
| US-C-06 break a trend down by axis value | U | `track.test.ts`, `coverage-2d.test.ts` | shipped |
| US-C-07 paper-ready export (chart PNG + method + CSV) | U + M | `track.test.ts` (series data); chart PNG / bundle manual | shipped |

## D. Discover

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-D-01 frequent n-grams | **M** | — (no unit test on `ngrams.ts`) | shipped; **test gap** |
| US-D-02…D-09 synonym discovery / accept-reject | U | `synonym-discovery.test.ts` | shipped |

## E. Map

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-E-01 one-axis distribution per document | U | `coverage.test.ts`, `coverage-2d.test.ts` | shipped |
| US-E-02 2D matrix for one document | U | `coverage-2d.test.ts` | shipped |
| US-E-03 project-aggregate matrix | U | `coverage-2d.test.ts` | shipped |
| US-E-04 clone project, swap axes | M | — | shipped |
| US-E-05 context-inferred (Function) axis | U | `classification.test.ts` | shipped |

## F. Audit

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-F-01 alert on out-of-place keywords | U | `audit.test.ts` | shipped |
| US-F-02 show surrounding sentences + expected section | U + M | `audit.test.ts`; presentation manual | shipped |
| US-F-03 confirmations (cache-only, no backend) | U | `audit.test.ts` | shipped |

## G. Read

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-G-01 concordance in context | U + M | `keyword-match.test.ts` (matching); view manual | shipped |
| US-G-02 link a match to its PDF page | M | — | shipped |
| US-G-03 page-numbered concordance | M | — | shipped |
| US-G-04 embedded PDF viewer, page deep-link | M | — | shipped |

## H. Score

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-H-01 per-document score on the active rule | U | `scoring.test.ts`, `wedding-cake.test.ts` | shipped |
| US-H-02 "why this score" (trace / matrix) | U | `wedding-cake.test.ts` (Evaluation Trace) | shipped |
| US-H-03 define own scoring rules (no code) | U + M | `scoring.test.ts` (evaluator); rule editor manual | shipped |
| US-H-04 project-level score distribution | U + M | `scoring.test.ts`; histogram manual | shipped |
| US-H-05 default rule pre-applied on fresh project | M | — (seed) | shipped |
| US-H-06 fine-grained X/12 pillar-coverage ratio | U | `wedding-cake.test.ts` | shipped |

## X. Cross-cutting

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| US-X-01 customise a framework non-destructively | M | — | shipped |
| US-X-02 export `.lens` bundle | M | — (bundle-export untested) | shipped; **test gap** |
| US-X-03 import a `.lens` bundle | M | — | shipped; **test gap** |
| US-X-04 backend-down feedback / offline features | U + M | `MLCaveatBanner.test.tsx`; status strip manual | shipped |
| US-X-05 works first run, sensible defaults | M | — (seed) | shipped |
| US-X-06 edit a document's attributes | M | — (`documents.ts` update) | shipped |
| US-X-07 bulk-CSV attribute correction | U | `csv.test.ts`, `keyword-csv.test.ts` | shipped |
| US-X-08 global Library across projects | M | — | shipped |
| US-X-09 clone a project | M | — | shipped |
| US-X-10 ML signals carry inline caveats | U | `MLCaveatBanner.test.tsx` | shipped |
| US-X-11 positive + counter in one polarity list | U | `coverage.test.ts` (data model) | shipped |
| US-X-12 mix-and-match Tag Axes per project | M | — | shipped |
| US-X-13 sustainability preload out of the box | M | — (seed) | shipped |
| US-X-14 recursive folder import | U + M | `import.test.ts`; folder walk validated manually | shipped |
| US-X-15 multi-select bulk edit | M | — | shipped; **test gap** |
| US-X-16 sort + search the Library | M | — | shipped; **test gap** |
| US-X-17 auto-detect document type on import | U + M | `import.test.ts` (`normalizeDocumentType`); detection manual | shipped |
| US-X-18 full-project DOCX report | U + M | `svg-chart.test.ts` (charts); DOCX render manual | shipped |
| US-X-19 AI observations (document + project) | U(inputs) + M | `focus.test.ts`/`substance.test.ts`/`scoring.test.ts` (deterministic inputs); **LLM output is non-deterministic → manual + always flagged** | shipped |
| US-X-20 configure a BYOK AI provider | M | — (needs a live provider) | shipped |

## Focus mode (not yet a US story)

| Story | Verified by | Backing test | Status |
|---|---|---|---|
| *(gap)* Focus — rank documents by notability | U | `focus.test.ts` (`meanStd`/`zScore`/`aggregateNotability`) | shipped; **needs a US-X-21 story** |

## Coverage summary

- **Automated (U/I):** the deterministic analysis engine — coverage, 2D matrix,
  scoring (incl. X/12), substance signals, focus notability, track, gap,
  audit, classification, synonyms, import, CSV, and the cross-view
  **reconciliation** invariant. This is the correctness core the DSR §7.2 claim
  (reproducibility/determinism) rests on.
- **Manual acceptance (M):** UI/UX (bulk edit, sort/search, project clone,
  axis mix-and-match), full-flow (`.lens` export/import), file output (DOCX,
  chart PNGs), and the **AI** stories (inherently non-repeatable, always flagged).
- **Known test gaps** (candidates for automated tests): `ngrams.ts` (US-D-01),
  `.lens` bundle export/import (US-X-02/03), Library bulk-edit/sort/search
  (US-X-15/16), and a US story + acceptance criterion for **Focus mode**.
- **No e2e harness yet** — the highest-value happy-path flows (import → classify
  → score → report) would be worth a small Playwright/Electron acceptance suite
  (P) before or alongside the paper's naturalistic evaluation (§7.1).
