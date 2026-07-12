# ADR-0028: Synthetic test corpus: Markdown sources in-repo, PDFs built on demand, expectations as a manifest

**Status:** Proposed
**Date:** 2026-07-12
**Evidence:** `src/services/substance.ts`, `src/services/focus.ts` (the signals under test); `src/services/seed.ts` + `src/data/sustainability-keywords.json` (the shipped keyword set the corpus is authored against); `samples/` (real PDFs, hardcoded in `e2e/happy-path.spec.ts`); ADR-0011, ADR-0012, ADR-0016

## Context

The substance signals (repetition, diversity, coverage-spread, evidence-reuse,
intensity) and Focus-mode ranking are tested today with unit tests over small
inline strings and e2e runs over three real annual reports. Real reports can't
exercise the signal *extremes* on demand (a designed-in greenwashing profile, a
high-repetition/low-diversity document, a clean multi-year trend), can't be
freely redistributed, and give tests nothing to assert against beyond "it ran".
The target research corpus is 400+ annual/strategy reports across organisation
sizes, sectors, and years — the tool needs fixtures shaped like that reality.
Lorem ipsum is unusable: section classification and domain mapping are
embedding-based (ADR-0007), so fixture text must be real prose that a sentence
encoder places correctly.

## Decision

Build a **synthetic, fictional test corpus authored in Markdown**, committed
under `samples/test-corpus/` together with a machine-readable **expectations
manifest**; generated PDFs are build artifacts, not committed.

- **Sources in repo, PDFs on demand.** Each document is a Markdown file with
  frontmatter (fictional org, size, sector, year, doc type, pages-target). A
  build script renders Markdown → styled HTML → PDF via Playwright's bundled
  Chromium `page.pdf()` (already a devDependency — no pandoc/LaTeX/system
  deps), so anyone can regenerate the corpus and reproduce the tests. Any
  figures are committed image assets referenced from the Markdown.
- **Authored against the shipped keyword set.** Corpus prose is written to hit
  (or deliberately avoid) the first-run sustainability seed keywords and their
  SDG/Pillar/Function tags (ADR-0016), so a clean install + corpus import
  exercises the full pipeline with zero configuration.
- **Expectations are relative, not absolute.** `corpus-manifest.json` records
  each document's intended signal profile as orderings and bands ("repetition:
  high", "rep(doc A) > rep(doc B)", "intensity trend 2020→2024: rising"), not
  exact values — signal formulas may be tuned without rewriting the corpus.
  Tests consume the manifest at two levels: unit tests run the pure functions
  in `substance.ts`/`focus.ts` over the extracted Markdown text; an e2e path
  imports the generated PDFs into a throwaway profile.
- **Corpus shape.** Roughly 15–20 documents, 1–10 pages each: three fictional
  organisations (small/medium/large, different sectors) with 3–5 year report
  series for trend testing; one matched greenwashing pair (glossy
  high-tone/low-substance vs. modest high-substance — exercises ADR-0010's
  Tone–Substance Gap plus high evidence-reuse and repetition); and
  single-signal extreme documents where a series can't isolate a signal (e.g.
  maximal-coverage vs. one-cell-concentrated for coverage-spread). One
  document may serve several expectations; the manifest, not the filename, is
  the source of truth for what each tests.

## Alternatives considered

- **Commit generated PDF binaries** — rejected: undiffable, bloats the repo,
  and hides the authored intent; the Markdown *is* the fixture, the PDF is a
  rendering.
- **pandoc/LaTeX or reportlab for rendering** — rejected: new system or
  Python-side dependencies and a second styling system; Playwright's Chromium
  is already installed for e2e and HTML/CSS mimics report layouts well.
- **Lorem ipsum / template-generated filler** — rejected: embedding-based
  classification needs semantically real prose; nonsense text would make the
  semantic analyzers the untested part.
- **Fixtures of real published reports** — rejected as the *primary* corpus:
  redistribution is murky, extremes can't be designed in, and expected values
  can only be captured as brittle snapshots. The existing real samples stay
  as smoke-test complements.
- **Exact expected values in the manifest** — rejected: pins the signal
  formulas; any tuning (ADR-0011 signals are still evolving) would churn
  every fixture.

## Consequences

- Signal changes get regression cover with researcher-shaped data, and the
  corpus doubles as a demo dataset and as documentation-by-example of what
  each signal means.
- Authoring ~15–20 realistic fictional reports is real writing effort; the
  corpus grows lazily — start with the greenwashing pair, one trend series,
  and one extreme per signal.
- The corpus is coupled to the seed keyword list: reworking the shipped
  keywords (ADR-0016) means re-checking manifest expectations. Relative
  orderings soften but don't remove this.
- Fictional organisation names must be obviously fictional (and stated as
  such in each document) so generated PDFs are never mistaken for real
  disclosures.
- Revisit if the corpus needs to scale past hand-authoring (e.g. 400-doc
  performance fixtures) — that calls for a generator that permutes the
  hand-written base texts, a different decision.
