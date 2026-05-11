# Document Lens — User Stories & Design Principles

**Status:** DRAFT for review. This document is the source-of-truth for design
decisions. Every PR that adds, removes, or restructures user-facing
functionality should reference one or more user-story IDs.

---

## Design principles

These are non-negotiable. If a proposed change conflicts with a principle,
the change needs a written justification — not the principle.

1. **One question, one page, one primary visualisation.**
   Every workflow page must answer a single, plainly-worded question. If a
   page answers two questions, it's two pages. If it has no question, it's
   not a workflow page — it's settings.

2. **User vocabulary, not engineer vocabulary.**
   Page titles, menu items, and button labels use the verbs the researcher
   uses ("Compare", "Track", "Discover"). Engineer terms ("Sentiment
   Analysis", "Embedding Mapping", "Domain Inference") may appear in
   tooltips or help text but never in primary navigation.

3. **Always show the level of analysis explicitly.**
   Every chart, table, and metric must visibly indicate: (a) is this one
   document or many? (b) is this keyword-driven or generic? (c) at what
   tier is the data rolled up? A user should never wonder "what am I
   looking at?".

4. **Defaults for non-experts; depth on demand.**
   Sensible defaults make the first run productive without configuration.
   Advanced controls (thresholds, model selection, similarity cutoffs) live
   behind a "More options" disclosure, not on the main surface.

5. **Failure modes are non-fatal.**
   Backend down? Local features (keyword search, visualisations, export)
   still work. Document parse failed? Mark it, surface a "retry" affordance,
   continue with the rest. Never block the whole app on one failure.

6. **Frameworks are starting points, not endpoints.**
   Built-in keyword frameworks (SDGs, TCFD, NIST CSF, etc.) exist to bootstrap
   custom keyword lists. The serious analysis happens with custom lists.
   Built-in lists are toggle-only; custom lists are fully editable. The
   workflow from "framework" to "custom" must be one click.

7. **Results are exportable, citable, reproducible.**
   Every chart and table can be exported (PNG, CSV, Excel). Every keyword
   match links back to the page and section in the source document. Every
   project can be shared as a `.lens` bundle that fully reproduces the
   analysis on another machine.

---

## Personas

The same person plays all of these roles at different moments — don't
over-fit to any one persona.

- **Domain researcher** (primary). Academic or applied researcher analysing
  a corpus of documents (e.g., 10 years of Australian annual reports for
  sustainability disclosure trends). Comfortable with spreadsheets and PDFs.
  Not a programmer. Not a statistician. Knows their framework intimately.
- **Compliance reviewer** (secondary). Reviewing corporate documents
  against a regulatory framework (NIST CSF, ISO 27001, SEC). Wants
  defensible coverage reports.
- **Collaborator** (tertiary). Receives a `.lens` bundle from a colleague
  and wants to understand or extend the analysis without recreating it.

---

## Workflows and user stories

Status legend:
- **CONFIRMED** — explicitly validated by the user
- **DRAFT** — synthesis of the user's mental model; awaiting confirmation
- **SPECULATIVE** — extension proposed by design; not yet discussed

### A. Coverage — "Which of my documents discuss this framework?"

| ID | Story | Status |
|---|---|---|
| US-A-01 | As a researcher, I want to see at a glance which of my documents discuss each topic in my chosen framework, so that I can identify which reports are worth deep reading. | CONFIRMED |
| US-A-02 | As a researcher, I want to switch the view between individual keywords and higher tier roll-ups (e.g., SDG keywords ↔ SDG goals ↔ SDG pillars), so that I can present at the level my audience expects. | CONFIRMED |
| US-A-03 | As a researcher, I want coverage results to be exportable as CSV/Excel, so that I can include them in a paper or report. | CONFIRMED |

**Wires to:** existing local keyword search; document × keyword heatmap as
primary viz; tier-aggregation toggle.

### B. Compare — "Which company / report does best on this framework?"

| ID | Story | Status |
|---|---|---|
| US-B-01 | As a researcher, I want to compare multiple documents (or companies) on the same framework, so that I can rank them on coverage or quality of disclosure. | DRAFT |
| US-B-02 | As a researcher, I want to compare a single company's coverage of multiple frameworks side-by-side, so that I can see which lenses they prioritise. | SPECULATIVE |
| US-B-03 | As a compliance reviewer, I want a "framework completeness score" per document, so that I can rank submissions by disclosure quality. | DRAFT |

**Wires to:** existing local data; new comparison view (replaces parts of
the current Visualisations page).

### C. Track — "How has this topic changed over the years?"

| ID | Story | Status |
|---|---|---|
| US-C-01 | As a researcher, I want to see how a single company's coverage of a topic has changed over multiple years, so that I can identify trends, shifts in tone, or evolving disclosure practices. | CONFIRMED |
| US-C-02 | As a researcher, I want to see how the *language* (not just the keyword counts) used around a topic has changed over time, so that I can detect rhetorical shifts that simple counts miss. | DRAFT |
| US-C-03 | As a researcher, I want to overlay multiple companies on the same trend chart, so that I can compare longitudinal trajectories. | SPECULATIVE |

**Wires to:** existing data + optional `analyzeSentiment` for US-C-02; new
trend page (replaces parts of Visualisations); requires year metadata on
each document (currently auto-detected from filenames — needs a UI to
correct it).

### D. Discover — "What words is my corpus using that I should add to my keyword list?"

| ID | Story | Status |
|---|---|---|
| US-D-01 | As a researcher, I want to find frequently-occurring 2-3 word phrases in my corpus, so that I can discover terminology I didn't know to look for. | CONFIRMED |
| US-D-02 | As a researcher, I want to see corpus terms that are conceptually close to my existing keywords (synonym-like), so that I can extend my custom list without missing relevant terminology. | CONFIRMED |
| US-D-03 | As a researcher, I want a one-click "add to my custom keyword list" affordance on each discovered term, so that the discover→customise loop is fast. | CONFIRMED |

**Wires to:** existing n-gram endpoint + new synonym-discovery (uses
embeddings on corpus terms vs. keywords; may need a new backend endpoint
or use existing `mapDomains` differently).

### E. Map — "If I name 5 domains I care about, how does this document distribute across them?"

| ID | Story | Status |
|---|---|---|
| US-E-01 | As a researcher, I want to define a small set of domains I care about (e.g., "Risk", "Sustainability", "Innovation") and see how a document distributes across them, so that I can quickly understand its emphasis without reading cover-to-cover. | CONFIRMED |
| US-E-02 | As a researcher, I want domain-mapping to work without me defining keywords for each domain (using semantic similarity), so that I can use it as a quick first-pass before any keyword work. | DRAFT |
| US-E-03 | As a researcher, I want to apply the same domain set across all documents in a project, so that I can compare emphasis across documents. | SPECULATIVE |

**Wires to:** orphan `mapDomains` API method (already defined, never
called); new view per document + project-level aggregate.

### F. Audit — "Are keywords appearing in sections where they don't belong?"

| ID | Story | Status |
|---|---|---|
| US-F-01 | As a researcher, I want to be alerted when keywords appear in unexpected sections (e.g., "climate risk" discussed under Marketing rather than Risk Management), so that I can investigate whether the company is downplaying, hiding, or mis-framing important topics. | CONFIRMED |
| US-F-02 | As a researcher, I want to see, for each "out of place" keyword, the surrounding sentences and the section it normally belongs in, so that I can quote the anomaly in a paper. | DRAFT |

**Wires to:** orphan `detectStructuralMismatch` API method (already defined,
never called); new view per document (probably a tab on DocumentView).

### G. Read — "What does this document actually say about this topic?"

| ID | Story | Status |
|---|---|---|
| US-G-01 | As a researcher, I want to read what a document actually says about a specific keyword in context (concordance view), so that I can quote, cite, or fact-check claims. | DRAFT |
| US-G-02 | As a researcher, I want each match to link back to the page in the original PDF, so that I can verify and cite by page number. | CONFIRMED |

**Wires to:** existing extracted text + page-anchor metadata; new
concordance view (probably an extension of the existing DocumentView).

---

## Cross-cutting stories

These don't belong to a single workflow — they shape multiple.

| ID | Story | Status |
|---|---|---|
| US-X-01 | As a researcher, I want to start from a built-in framework and customise it (toggle keywords off, add my own) without losing the original framework, so that I can refine my analysis without rebuilding from scratch. | CONFIRMED |
| US-X-02 | As a researcher, I want to share my project (documents + keywords + analysis) with a collaborator as a single file, so that they can replicate or extend my analysis. | CONFIRMED |
| US-X-03 | As a collaborator, I want to import a `.lens` bundle and immediately see the same analysis the sender saw, without needing to rerun anything. | DRAFT |
| US-X-04 | As a researcher, I want clear feedback when the backend is unreachable, with a list of which features still work offline, so that I'm not stuck guessing. | CONFIRMED (already implemented via status strip) |
| US-X-05 | As a non-technical user, I want the app to work the first time I open it, with sensible defaults, so that I can be productive without reading documentation. | CONFIRMED |

---

## Open questions to resolve before building

1. **Project-level aggregate as a first-class concept.** Currently each
   workflow defaults to "this document" or "all documents". Some workflows
   (B. Compare, C. Track) need explicit grouping (by company, by year,
   by sector). Do we model these groupings in the data layer, or treat
   them as ad-hoc UI filters?

2. **Domain definitions: persistent or per-analysis?** When a researcher
   defines domains for E. Map, should those domains save to the project
   (reusable across documents), the keyword library (reusable across
   projects), or be one-shot per analysis?

3. **Synonym discovery (D. US-D-02): what does "conceptually close" mean
   in the UI?** A similarity threshold? Top-N nearest? A "show me 10
   suggestions" button? Non-experts won't know what 0.7 cosine similarity
   means.

4. **Trend chart (C): how do we surface the year-metadata problem?** Many
   users will have documents named `Acme_2022_Annual.pdf` (auto-detectable)
   and others named `report.pdf` (not). What's the UX for fixing missing
   year metadata at scale?

5. **Sentiment over time (US-C-02): how do we show this without implying
   precision the model doesn't have?** Sentiment scores at this scale are
   coarse. The chart label and explanation matter a lot.
