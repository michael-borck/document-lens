# Document Lens — User Stories & Design Principles

**Status:** Working draft. This document is the source-of-truth for design
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

8. **Be honest about model limitations.**
   Wherever ML signals appear (sentiment, embedding-based domain mapping,
   synonym suggestions), label them as *signals* not *facts*. Use plain
   language ("approximate", "treat as a hint", "the model agrees with this
   ~70% of the time"). Never display a sentiment score, similarity
   percentage, or domain-distribution chart without an inline caveat
   appropriate to its precision.

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

## Data model

This is the conceptual model that user stories assume. Implementation may
use additional structures, but these are the entities the user sees and
talks about.

### Entities

- **Library** (global). The single source of truth for documents. Every
  document the user has ever imported lives here.
- **Document** (in Library). A single file (PDF, DOCX, PPTX, TXT, MD) plus
  extracted text plus attributes:
  - `title` (string, user-editable)
  - `year` (number | null) — auto-detected from filename when possible,
    user-editable when not. **Null, not 0000.** Charts and trends display
    `null`-year documents in a separate "Year unknown" bucket, never inline
    with real years.
  - `company` / `entity` (string, optional, user-editable) — the
    organisation the document belongs to, used for grouping.
  - `sector` / `category` (string, optional, user-editable) — domain
    category for cross-cohort analysis.
  - `page_count`, `word_count`, `import_date`, etc. (system-managed).
- **Domain list** (global, named). A small set of named domains (e.g.,
  "Risk", "Sustainability", "Innovation", "Governance"). Used by
  workflow E (Map). Discipline-specific — defines the *lens* through
  which the researcher views documents.
- **Keyword list** (global, named). Either:
  - **Built-in framework** (toggle-only): pre-shipped lists like SDGs,
    TCFD, NIST CSF. Users can toggle keywords on/off but cannot add,
    rename, or restructure.
  - **Custom list** (fully editable): user-created or copied-from-builtin.
    Add, rename, restructure, organise into hierarchical tiers.
- **Keyword** (within a Keyword list). The unit of search. Has a string
  value, optional tier path (e.g., `Environmental > SDG-13 > climate`),
  and a child **synonym list**.
- **Synonym list** (per Keyword). A user-curated set of synonym terms for
  that keyword. Editable for both built-in and custom keywords (synonyms
  are user metadata layered on top, not part of the framework definition).
  Each synonym has on/off toggle.
- **Project**. A unit of *analysis configuration*, not a unit of storage:
  - Selects a subset of Library documents
  - Picks **one Domain list** (cardinality 1:N — one Domain list serves many
    Projects, but a Project has exactly one)
  - References zero or more Keyword lists
  - Caches analysis results (so the user doesn't re-run on every open)
  - Stores grouping/filter preferences (e.g., "group by company", "filter
    to year ≥ 2015")

### Relationships and cardinality

```
Library ──< Document
Library ──< Domain list ──< Project
Library ──< Keyword list ──< (used by) Project
Keyword list ──< Keyword ──< Synonym
Project ──< (selects) Document
Project ──> (one) Domain list
```

### Workflows on this model

- **Re-analyse same docs through a different lens** = clone Project,
  swap Domain list (or Keyword lists), keep Document selection
- **Compare two analyses** = two Projects over the same Documents
- **Share with a collaborator** = export Project (selected docs +
  configs + cached results) as a `.lens` bundle
- **Bulk year correction** = upload a `filename,year` CSV against the
  Library; updates apply to every Project that references those documents

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
| US-A-04 | As a researcher, I want coverage to count synonym matches (where I've accepted them) alongside the parent keyword, so that I'm not undercounting because the document used a near-equivalent term. | CONFIRMED |

**Wires to:** existing local keyword search; document × keyword heatmap as
primary viz; tier-aggregation toggle; synonym-aware match counter.

### B. Compare — "Which company / report does best on this framework?"

| ID | Story | Status |
|---|---|---|
| US-B-01 | As a researcher, I want to compare multiple documents (or companies) on the same framework, so that I can rank them on coverage or quality of disclosure. | DRAFT |
| US-B-02 | As a researcher, I want to compare a single company's coverage of multiple frameworks side-by-side, so that I can see which lenses they prioritise. | SPECULATIVE |
| US-B-03 | As a compliance reviewer, I want a "framework completeness score" per document, so that I can rank submissions by disclosure quality. | DRAFT |
| US-B-04 | As a researcher, I want to filter the comparison by document attributes (year ≥ 2018, sector = "Banking", company in [...]), so that I can scope the comparison to a meaningful cohort. | CONFIRMED |

**Wires to:** existing local data; new comparison view (replaces parts of
the current Visualisations page); filter UI driven by Document attributes.

### C. Track — "How has this topic changed over the years?"

| ID | Story | Status |
|---|---|---|
| US-C-01 | As a researcher, I want to see how a single company's coverage of a topic has changed over multiple years, so that I can identify trends, shifts in tone, or evolving disclosure practices. | CONFIRMED |
| US-C-02 | As a researcher, I want to see how the *language* (not just the keyword counts) used around a topic has changed over time, so that I can detect rhetorical shifts that simple counts miss. | DRAFT |
| US-C-03 | As a researcher, I want to overlay multiple companies on the same trend chart, so that I can compare longitudinal trajectories. | SPECULATIVE |
| US-C-04 | As a researcher, I want documents with unknown year to appear in a separate "Year unknown" bucket on trend charts, never silently dropped, so that I can see at a glance how much data is missing. | CONFIRMED |

**Wires to:** existing data + optional `analyzeSentiment` for US-C-02; new
trend page (replaces parts of Visualisations); requires `Document.year`
attribute (number | null) and the year-correction UI from US-X-06.

**Sentiment honesty:** any C-* story that uses sentiment must follow
design principle #8 — label it as a coarse signal, not a precise measure.

### D. Discover — "What words is my corpus using that I should add to my keyword list?"

| ID | Story | Status |
|---|---|---|
| US-D-01 | As a researcher, I want to find frequently-occurring 2-3 word phrases in my corpus, so that I can discover terminology I didn't know to look for. | CONFIRMED |
| US-D-02 | As a researcher, I want to see corpus terms that are conceptually close to my existing keywords (synonym-like), so that I can extend my custom list without missing relevant terminology. | CONFIRMED |
| US-D-03 | As a researcher, I want a one-click "add to my custom keyword list" affordance on each discovered n-gram, so that the discover→customise loop is fast. | CONFIRMED |
| US-D-04 | As a researcher, I want to view candidate synonyms one keyword at a time (one list per keyword), with each candidate showing how often it appears in the corpus, so that I can judge whether it's worth adding. | CONFIRMED |
| US-D-05 | As a researcher, I want each candidate synonym to have explicit Accept / Reject controls, so that I'm in charge of what gets included — not an algorithm. | CONFIRMED |
| US-D-06 | As a researcher, I want accepted synonyms to be stored as a synonym list attached to the parent keyword (not flattened into the keyword list), so that I can see which terms are "real" keywords vs. user-accepted synonyms in reports. | CONFIRMED |
| US-D-07 | As a researcher, I want to add synonyms to keywords from built-in frameworks too (not only custom keywords), so that I don't have to copy a framework just to extend its matching. | CONFIRMED |
| US-D-08 | As a researcher, I want a "synonym discovery report" that lists all suggested synonyms across all keywords in one place, so that I can do an end-to-end pass before starting analysis. | CONFIRMED |

**Wires to:** existing n-gram endpoint (US-D-01) + new synonym-discovery
endpoint or use embeddings on corpus terms vs. keywords (US-D-02–US-D-08);
new per-keyword synonym list data structure; modifications to keyword
search to include accepted synonyms (US-A-04).

### E. Map — "Which discipline-specific lenses does this document cover, and how much?"

| ID | Story | Status |
|---|---|---|
| US-E-01 | As a researcher, I want to define a Domain list for my discipline (e.g., for sustainability research: "Environmental", "Social", "Economic", "Governance") and reuse it across many projects, so that my lens definitions are consistent across studies. | CONFIRMED |
| US-E-02 | As a researcher, I want each project to use exactly one Domain list (no per-document overrides within a project), so that comparisons across documents in the project share a common lens. | CONFIRMED |
| US-E-03 | As a researcher, I want to clone a project and swap its Domain list, so that I can re-analyse the same document selection through a different lens without losing the original analysis. | CONFIRMED |
| US-E-04 | As a researcher, I want domain mapping to work without me defining keywords for each domain (using semantic similarity), so that I can use it as a quick first-pass before any keyword work. | CONFIRMED |
| US-E-05 | As a researcher, I want to see how each document distributes across the project's Domain list (per-document chart) and how the project as a whole distributes (aggregate chart), so that I can spot outliers and overall emphasis. | CONFIRMED |

**Wires to:** orphan `mapDomains` API method; new global Domain list
manager (similar shape to existing Keyword List manager); per-project
Domain list selector; new view per document + project-level aggregate.

### F. Audit — "Are keywords appearing in sections where they don't belong?"

| ID | Story | Status |
|---|---|---|
| US-F-01 | As a researcher, I want to be alerted when keywords appear in unexpected sections (e.g., "climate risk" discussed under Marketing rather than Risk Management), so that I can investigate whether the company is downplaying, hiding, or mis-framing important topics. | CONFIRMED |
| US-F-02 | As a researcher, I want to see, for each "out of place" keyword, the surrounding sentences and the section it normally belongs in, so that I can quote the anomaly in a paper. | CONFIRMED |

**Wires to:** orphan `detectStructuralMismatch` API method; new view per
document (probably a tab on DocumentView).

### G. Read — "What does this document actually say about this topic?"

| ID | Story | Status |
|---|---|---|
| US-G-01 | As a researcher, I want to read what a document actually says about a specific keyword in context (concordance view), so that I can quote, cite, or fact-check claims. | CONFIRMED |
| US-G-02 | As a researcher, I want each match to link back to the page in the original PDF, so that I can verify and cite by page number. | CONFIRMED |

**Wires to:** existing extracted text + page-anchor metadata; new
concordance view (probably an extension of the existing DocumentView).

---

## Cross-cutting stories

These don't belong to a single workflow — they shape multiple.

| ID | Story | Status |
|---|---|---|
| US-X-01 | As a researcher, I want to start from a built-in framework and customise it (toggle keywords off, add my own) without losing the original framework, so that I can refine my analysis without rebuilding from scratch. | CONFIRMED |
| US-X-02 | As a researcher, I want to share my project (selected documents + keywords + analysis) with a collaborator as a single file, so that they can replicate or extend my analysis. | CONFIRMED |
| US-X-03 | As a collaborator, I want to import a `.lens` bundle and immediately see the same analysis the sender saw, without needing to rerun anything. | DRAFT |
| US-X-04 | As a researcher, I want clear feedback when the backend is unreachable, with a list of which features still work offline, so that I'm not stuck guessing. | CONFIRMED (already implemented via status strip) |
| US-X-05 | As a non-technical user, I want the app to work the first time I open it, with sensible defaults, so that I can be productive without reading documentation. | CONFIRMED |
| US-X-06 | As a researcher, I want to manually edit a document's year (and other attributes) when auto-detection failed or is wrong, so that trend charts and filters work correctly. | CONFIRMED |
| US-X-07 | As a researcher with hundreds of documents, I want to upload a `filename,year` (or `title,year,company,sector`) CSV to bulk-correct attributes across the Library in one go, so that I don't have to edit each document individually. | CONFIRMED |
| US-X-08 | As a researcher, I want documents to live in a global Library, not inside a single project, so that I can re-use the same documents across multiple projects without re-importing. | CONFIRMED |
| US-X-09 | As a researcher, I want to clone an existing project (its document selection, keywords, domains, settings) into a new project that I can then modify, so that I can experiment with different analysis configurations without losing the original. | CONFIRMED |
| US-X-10 | As a researcher, I want any chart that uses a coarse ML signal (sentiment, semantic similarity) to display an inline caveat about its precision, so that I don't accidentally over-cite an approximate result. | CONFIRMED (per design principle #8) |

---

## Resolved decisions (was: Open questions)

These were the design questions that blocked the workflow design. They
are now decided. If a decision needs to change, edit it here and tag the
story IDs that the change affects.

### 1. Document grouping (was: project-level aggregate as a first-class concept)

**Decision:** Group in the **data layer** via Document attributes
(`year`, `company`, `sector`). Charts and filter UIs read from these
attributes; there's no separate "Cohort" or "Group" entity.

Rationale (from the user): *"in the data layer (which means we see/filter
in the charts is that the design plan)"*

**Affects:** US-B-04 (filter the comparison), US-C-01 (per-company trend),
US-X-06/US-X-07 (manual + bulk attribute editing).

### 2. Domain list scope (was: persistent or per-analysis?)

**Decision:** Domain lists are **global, named entities** (sit alongside
Keyword lists in the global library). Each Project picks **exactly one**
Domain list. Cardinality: one Domain list ↔ many Projects; one Project ↔
one Domain list.

To re-analyse the same documents through a different lens: clone the
project and swap the Domain list (US-X-09 + US-E-03).

Rationale (from the user): *"Domains I believe are independent to
keywords, are discipline (focus/lens used for the study) specific, and
are created globally and associated with a project. I would say one to
many mapping … They can always clone an existing project and change the
domain mapping if they want to investigate different domains."*

**Affects:** US-E-01 through US-E-05; US-X-09 (project cloning);
data model.

### 3. Synonym discovery UX

**Decision:**
- Backend produces a list of synonym candidates **per keyword**
  (one list per keyword), each candidate carrying its corpus
  frequency.
- UI shows candidates one keyword at a time with explicit Accept / Reject
  buttons (no implicit acceptance, no thresholds the user has to think
  about).
- Accepted synonyms are stored in a **per-keyword synonym list** (a child
  of the keyword), **not** flattened into the keyword list itself.
  Provenance is preserved: reports can show "matches for *climate* (and
  3 accepted synonyms)".
- Synonyms can be added to **both built-in framework keywords and custom
  keywords**. Synonyms are user metadata layered on top of the framework
  definition; they don't violate the toggle-only rule for built-in
  keywords (the framework's keyword text stays unchanged).
- A separate "Synonym Discovery Report" page shows candidates across all
  keywords in one place for end-to-end review.

Rationale (synthesis from the user's question): the user explicitly liked
the per-keyword synonym list framing and was undecided between
"flatten into keyword list" vs "attach as child list". My recommendation
goes with the attached child list because it preserves provenance, lets
users toggle synonym-matching on/off independently of keyword-matching,
and keeps the toggle-only invariant for built-in frameworks intact.

**Affects:** US-A-04 (synonym-aware coverage counts), US-D-04 through
US-D-08; data model (per-keyword synonym list entity).

### 4. Year metadata UX

**Decision:**
- `Document.year` is `number | null` (not 0000-as-sentinel — using a
  sentinel value means every chart, filter, and aggregation has to
  remember to exclude it, and someone always forgets).
- Auto-detection from filename on import (`Acme_2022_Annual.pdf` →
  `2022`).
- Per-document edit UI for one-at-a-time correction (US-X-06).
- Bulk-correction by uploading a CSV with `filename,year` columns
  (US-X-07). Same mechanism extends to other attributes
  (`filename,year,company,sector`).
- On charts: documents with `year = null` always appear in a separate
  "Year unknown" bucket, never silently dropped (US-C-04).

Rationale: the user proposed `0000` as a missing-year sentinel that
keeps the field type `number`. Pushed back because sentinels are a
known footgun in data work (every consumer has to remember to filter
them; they show up in min/max/sort operations as real values; they
break range filters). `number | null` is what TypeScript and SQL
both support natively, and the UI shows "—" or "Year unknown".

**Affects:** US-C-01, US-C-04, US-X-06, US-X-07; Document data model.

### 5. Sentiment honesty

**Decision:** Adopted as design principle #8 — every ML-derived signal
(sentiment, embedding similarity, semantic domain mapping, synonym
suggestions) must carry an inline caveat appropriate to its precision.

Sentiment specifically: label as "approximate sentiment signal — treat
as a hint, not a fact. Useful for spotting *changes* in tone over
time more than for absolute claims about any single document."

Rationale (from the user): *"Just be honest, say sentiment at this scale
is coarse, treat with care, it's just a 'signal' not a fact or
something like that."*

**Affects:** US-C-02 (sentiment over time), US-E-04 (semantic domain
mapping), US-D-02 (semantic synonym suggestions), US-X-10
(general caveat pattern).
