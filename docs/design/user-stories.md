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
   tier or axis is the data rolled up? A user should never wonder "what am
   I looking at?".

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
   Wherever ML signals appear (sentiment, embedding-based tag inference,
   synonym suggestions), label them as *signals* not *facts*. Use plain
   language ("approximate", "treat as a hint", "the model agrees with this
   ~70% of the time"). Never display a sentiment score, similarity
   percentage, or context-classification chart without an inline caveat
   appropriate to its precision.

9. **Generalise the structure; ship sustainability defaults.**
   The data model and workflows are domain-agnostic — keyword polarity,
   tag axes, and scoring rules apply equally to sustainability research,
   cybersecurity compliance, financial disclosure analysis, etc. But the
   app ships pre-loaded with the SDG keyword set, the Wedding Cake pillar
   axis, the Function axis (Teaching / Research / Engagement / Operations)
   and the 5-level Wedding Cake Score so that sustainability researchers
   are productive immediately, with zero configuration.

10. **Deterministic and repeatable by default; GenAI is opt-in and flagged.**
    Every analytical signal the app computes is deterministic and reproducible
    from the same inputs — the same corpus + keywords + configuration yields
    the same numbers. Generative AI (an LLM) is never used to *compute* a
    signal; it is an optional, bring-your-own-key *interpretation* layer whose
    output is always labelled "AI-generated" and "not a repeatable signal".
    This keeps the method reproducible for research, and transparent about what
    is measured versus what is interpreted. (See ADR-0011, ADR-0014.)

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
  - `sector` / `category` (string, optional, user-editable) — broad
    category for cross-cohort analysis.
  - `type` (string, optional) — document type (e.g. "Annual Report",
    "Sustainability Report"). Auto-detected from content on import (backend
    inference), free-text and user-editable. A faceting dimension.
  - `company_size` (Small | Medium | Large, optional, user-editable) — a
    coarse, manual size band. No external size data exists, so it is a
    faceting/comparison dimension, not a computed value (see substance
    signals, US-B-06+).
  - `page_count`, `word_count`, `import_date`, etc. (system-managed).
- **Tag Axis** (global, named). A dimension along which keywords or
  keyword-mentions can be classified. Two source types:
  - `keyword-attached`: values are part of each keyword's definition
    (e.g., the SDG axis carries values 1–17, assigned per keyword in
    the SDG keyword list; the Pillar axis derives from SDG via a
    fixed mapping).
  - `document-context`: values are inferred from where the keyword
    appears in the document (e.g., the Function axis tags each
    keyword *mention* with Teaching / Research / Engagement /
    Operations based on the surrounding section).
  Each axis is either flat (e.g., Function) or hierarchical
  (e.g., Pillar → SDG, where Pillar is a roll-up of SDG).
  Tag Axes replace the earlier "Domain list" entity — that concept
  was a special case of an enumerated tag axis.
- **Keyword List** (global, named). Either:
  - **Built-in framework** (toggle-only): pre-shipped lists like SDGs,
    TCFD, NIST CSF. Users can toggle keywords on/off but cannot add,
    rename, or restructure. Each built-in list declares which Tag
    Axes its keywords carry values for.
  - **Custom list** (fully editable): user-created or copied-from-
    builtin. Add, rename, restructure, declare new tag axes.
- **Keyword** (within a Keyword List). The unit of search. Has:
  - `text` (string)
  - `polarity: 'positive' | 'counter'` — *positive* keywords indicate
    the framework topic IS being delivered (e.g., "renewable energy
    initiatives" for SDG 7); *counter* keywords indicate the topic is
    being **un**dermined or performatively framed (e.g., "fossil fuel
    partnerships" for SDG 7, "carbon offset reliance (without
    reduction)" for SDG 13). Both kinds carry the same SDG tag — the
    polarity is the difference.
  - `tags: { axis_id: value | value[] }` — the values this keyword
    carries on each Keyword-attached axis. e.g., the keyword "campus
    water management" might carry `{ sdg: 6, pillar: 'biosphere' }`.
  - `synonyms: SynonymList` — child list of user-curated synonym
    terms.
- **Synonym** (per Keyword). A user-curated term semantically close to
  the parent keyword. Editable for both built-in and custom keywords
  (synonyms are user metadata layered on top, not part of the
  framework definition). Each has on/off toggle.
- **Scoring Rule** (global, named). A user-definable rule that
  computes a score (numeric or label) from the analysis output.
  Examples:
  - "5-level Wedding Cake Score" (default, ships with the app):
    Level 0–4 based on whether economic, environmental, and social
    SDGs are delivered simultaneously across the four core
    Functions. Specifically: Level N = N of the four Functions
    deliver all three pillars (Economy / Society / Biosphere) at the
    same time.
  - User-defined: e.g., "NIST CSF Maturity" rule for cybersecurity
    research, computing a 0–4 maturity score per CSF function.
  Scoring rules are reusable across projects.
- **Project**. A unit of *analysis configuration*, not a unit of
  storage:
  - Selects a subset of Library documents
  - References one or more **Keyword Lists**
  - Activates zero or more **Tag Axes** (typically one Keyword-
    attached axis per active Keyword List + any Document-context
    axes the user wants to apply, e.g., Function)
  - References zero or more **Scoring Rules** (typically one default
    + any user-defined rules)
  - Caches analysis results
  - Stores grouping/filter preferences (e.g., "group by company",
    "filter to year ≥ 2015")

### Relationships and cardinality

```
Library ──< Document
Library ──< Keyword List ──< (used by) Project
Library ──< Tag Axis ──< (activated by) Project
Library ──< Scoring Rule ──< (referenced by) Project
Keyword List ──> declares ──> Tag Axis (for keyword-attached axes)
Keyword List ──< Keyword
Keyword ──< Synonym
Keyword ──> tags ──> Tag Axis values
Project ──< (selects) Document
```

### Workflows on this model

- **Re-analyse same docs through a different lens** = clone Project,
  swap Keyword List or Tag Axes, keep Document selection
- **Compare two analyses** = two Projects over the same Documents
- **Share with a collaborator** = export Project (selected docs +
  configs + cached results) as a `.lens` bundle
- **Bulk year correction** = upload a `filename,year` CSV against the
  Library; updates apply to every Project that references those documents
- **Counter-keyword analysis** = a Coverage view filtered to
  `polarity = 'counter'`, or a Compare view scoring `positive_matches -
  counter_matches`, or a Track view of counter-mentions over time
  (greenwashing trend detection)
- **2D cross-tabulation** = a Map view with two axes selected
  (e.g., SDG × Function) showing the matrix per document or per
  project aggregate

---

## Workflows and user stories

Status legend (the **Status** column in the tables below records *design
confirmation*, not whether a story shipped):
- **CONFIRMED** — explicitly validated by the user
- **DRAFT** — synthesis of the user's mental model; awaiting confirmation
- **SPECULATIVE** — extension proposed by design; not yet discussed

> **For what is actually built, see [Implementation status](#implementation-status)
> below — the Status column above is a design-phase artefact and is no longer
> a reliable indicator of build state.**

### A. Coverage — "Which of my documents discuss this framework?"

| ID | Story | Status |
|---|---|---|
| US-A-01 | As a researcher, I want to see at a glance which of my documents discuss each topic in my chosen framework, so that I can identify which reports are worth deep reading. | CONFIRMED |
| US-A-02 | As a researcher, I want to switch the view between individual keywords and higher tier roll-ups (e.g., SDG keywords ↔ SDG goals ↔ SDG pillars), so that I can present at the level my audience expects. | CONFIRMED |
| US-A-03 | As a researcher, I want coverage results to be exportable as CSV/Excel, so that I can include them in a paper or report. | CONFIRMED |
| US-A-04 | As a researcher, I want coverage to count synonym matches (where I've accepted them) alongside the parent keyword, so that I'm not undercounting because the document used a near-equivalent term. | CONFIRMED |
| US-A-05 | As a researcher, I want to filter coverage by keyword polarity (positive / counter / both), so that I can see how much a document signals topic alignment vs how much it signals counter-alignment (e.g., greenwashing language). | CONFIRMED |
| US-A-06 | As a researcher, I want to filter coverage by Tag Axis value (e.g., "show only Teaching mentions" or "show only SDG-13 keywords"), so that I can scope the heatmap to the slice that matters for a given question. | CONFIRMED |

**Wires to:** existing local keyword search; document × keyword heatmap as
primary viz; tier-aggregation toggle; synonym-aware match counter;
polarity toggle; per-axis filters.

### B. Compare — "Which document does best on this framework?"

| ID | Story | Status |
|---|---|---|
| US-B-01 | As a researcher, I want to compare multiple documents (or companies) on the same framework, so that I can rank them on coverage or quality of disclosure. | DRAFT |
| US-B-02 | As a researcher, I want to compare a single company's coverage of multiple frameworks side-by-side, so that I can see which lenses they prioritise. | SPECULATIVE |
| US-B-03 | As a compliance reviewer, I want a "framework completeness score" per document, so that I can rank submissions by disclosure quality. | DRAFT |
| US-B-04 | As a researcher, I want to filter the comparison by document attributes (year ≥ 2018, sector = "Banking", company in [...]), so that I can scope the comparison to a meaningful cohort. | CONFIRMED |
| US-B-05 | As a researcher, I want to rank documents by a custom **Scoring Rule** (e.g., the 5-level Wedding Cake Score for sustainability work), so that the comparison reflects the rubric I actually care about — not just raw match counts. | CONFIRMED |
| US-B-06 | As a researcher, I want a **repetition** measure (matches ÷ unique keyword), so that I can spot documents that say a lot using the same few terms — loud but thin — which raw counts hide. | IMPLEMENTED (Compare metric, v0.26.0) |
| US-B-07 | As a researcher, I want an **evidence-reuse** measure (share of matches on keywords tagged to more than one pillar), so that I can detect a document that "ticks every box" by counting the same evidence toward many pillars. | IMPLEMENTED (v0.26.0) |
| US-B-08 | As a researcher, I want **diversity** (keyword breadth), **intensity** (matches per 1k words, size-normalised), and **coverage-spread** (fraction of the pillar×function matrix filled) measures, so that I can characterise breadth vs. depth of commitment beyond volume. | IMPLEMENTED (v0.26.0) |
| US-B-09 | As a researcher, I want every substance measure to carry a **confidence** indicator (from evidence volume), so that I discount an extreme ratio built on a short document with few matches. | IMPLEMENTED (v0.26.0) |
| US-B-10 | As a researcher, I want to **group/filter** any Compare metric by document `type`, `company_size`, company, sector, or year, so that patterns emerge as comparisons (e.g. "do large organisations show higher evidence-reuse than small ones?"). | IMPLEMENTED (v0.26.0) |

**Wires to:** existing local data; new comparison view (replaces parts of
the current Visualisations page); filter UI driven by Document attributes;
Scoring Rule selector.

### C. Track — "How has this topic changed over the years?"

> *This is the primary deliverable for the sustainability research use
> case — a paper showing whether sustainability reporting has increased
> or decreased over time. Track is the workflow most likely to produce
> the figure that ends up in print.*

| ID | Story | Status |
|---|---|---|
| US-C-01 | As a researcher, I want to see how a single company's coverage of a topic has changed over multiple years, so that I can identify trends, shifts in tone, or evolving disclosure practices. | CONFIRMED |
| US-C-02 | As a researcher, I want to see how far the *tone* (sentiment) runs ahead of the *substance* (keyword polarity) at document, section, and keyword levels — and how that gap evolves over time — so that I can detect performative disclosure patterns that raw keyword counts miss. | IMPLEMENTED (v-next — Tone–Substance Gap workflow tab) |
| US-C-03 | As a researcher, I want to overlay multiple companies on the same trend chart, so that I can compare longitudinal trajectories. | SPECULATIVE |
| US-C-04 | As a researcher, I want documents with unknown year to appear in a separate "Year unknown" bucket on trend charts, never silently dropped, so that I can see at a glance how much data is missing. | CONFIRMED |
| US-C-05 | As a researcher, I want to track positive-vs-counter keyword balance over time on the same chart, so that I can see whether a sector's reporting is becoming more substantive or more performative. | CONFIRMED |
| US-C-06 | As a researcher, I want to break down a trend by Tag Axis value (e.g., trend of SDG-13 mentions split by Function: Teaching / Research / Engagement / Operations), so that I can see *where* in core activity the change is happening. | CONFIRMED |
| US-C-07 | As a researcher, I want to export a trend chart **paper-ready** — chart PNG plus methodology blurb (which framework, which scoring rule, which filters, which document set, date range) plus underlying data CSV — so that I can drop it directly into a paper without manually reconstructing the methodology section. | CONFIRMED |

**Wires to:** existing data + optional `analyzeSentiment` for US-C-02;
new trend page (replaces parts of Visualisations); requires `Document.year`
attribute (number | null) and the year-correction UI from US-X-06; new
"export as paper-ready" bundle generator for US-C-07.

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
| US-D-09 | As a researcher, I want to discover candidate **counter-keywords** — corpus terms semantically close to my known counter-keywords — so that my counter-keyword list keeps pace with how greenwashing/performative language evolves. | CONFIRMED |

**Wires to:** existing n-gram endpoint (US-D-01) + new synonym-discovery
endpoint or use embeddings on corpus terms vs. keywords (US-D-02–US-D-09);
new per-keyword synonym list data structure; modifications to keyword
search to include accepted synonyms (US-A-04).

### E. Map — "Where in this document does each topic appear, and how do topics overlap?"

> *Was previously framed as "domain mapping". Reframed for the multi-axis
> tag model: Map shows how a document distributes across one or two Tag
> Axes simultaneously. With one axis selected, it's a per-document
> distribution. With two axes selected, it's a 2D cross-tabulation —
> directly producing the SDG × Function matrix the methodology calls
> for.*

| ID | Story | Status |
|---|---|---|
| US-E-01 | As a researcher, I want to see how each document distributes across a single Tag Axis (e.g., SDG, or Pillar, or Function), so that I can quickly understand a document's emphasis without reading it cover-to-cover. | CONFIRMED |
| US-E-02 | As a researcher, I want to view a 2D cross-tabulation of two Tag Axes for one document (e.g., SDG × Function), so that I can see which SDGs are addressed via which core activities. | CONFIRMED |
| US-E-03 | As a researcher, I want a project-aggregate view showing the cross-tabulation summed across all documents in the project, so that I can characterise the corpus as a whole. | CONFIRMED |
| US-E-04 | As a researcher, I want to clone a project and swap its active Tag Axes or Keyword Lists, so that I can re-analyse the same documents through a different lens without losing the original analysis. | CONFIRMED |
| US-E-05 | As a researcher, I want context-inferred axes (e.g., Function tagging from document section headings) to work without me having to manually classify each match, so that the per-document matrix is automatic. | DRAFT |

**Wires to:** new backend support for multi-axis tag inference (extends
the orphan `mapDomains` endpoint); per-document and project-aggregate
matrix views as primary visualisations.

### F. Audit — "Is each keyword being used in the right context?"

> *Bidirectional: when the keyword's context **does** align with its
> framework intent, that's a positive context confirmation. When it
> **doesn't**, that's a flagged anomaly. Both forms of evidence are
> valuable — confirmation supports defensible findings; anomalies
> surface possible misuse.*

| ID | Story | Status |
|---|---|---|
| US-F-01 | As a researcher, I want to be alerted when keywords appear in unexpected sections (e.g., "climate risk" discussed under Marketing rather than Risk Management), so that I can investigate whether the company is downplaying, hiding, or mis-framing important topics. | CONFIRMED |
| US-F-02 | As a researcher, I want to see, for each "out of place" keyword, the surrounding sentences and the section it normally belongs in, so that I can quote the anomaly in a paper. | CONFIRMED |
| US-F-03 | As a researcher, I want a positive-confirmation view (per the methodology's contextual relevance check) showing keywords whose use *was* verified to align with the framework intent, so that I can defend the analysis to a sceptical reviewer. | CONFIRMED |

**Wires to:** orphan `detectStructuralMismatch` API method (already
defined, never called) plus a complementary positive-confirmation pass;
new view per document (probably a tab on DocumentView).

### G. Read — "What does each document actually say about a topic?"

| ID | Story | Status |
|---|---|---|
| US-G-01 | As a researcher, I want to read what a document actually says about a specific keyword in context (concordance view), so that I can quote, cite, or fact-check claims. | CONFIRMED |
| US-G-02 | As a researcher, I want each match to link back to the page in the original PDF, so that I can verify and cite by page number. | CONFIRMED |
| US-G-03 | As a researcher, I want each match in the concordance view to show its **page number** (when available) and surrounding context, so that I can scan all matches in one place and check the document's structure without leaving the app. | CONFIRMED |
| US-G-04 | As a researcher, I want to view the original PDF inside the app with keyword matches highlighted, so that I don't have to switch context to verify a quote. (PDF only — DOCX/PPTX fall back to US-G-03's page-numbered concordance.) | CONFIRMED (low priority; Phase 5+) |

**Wires to:** existing extracted text + per-page text array (added to
schema 2026-05-12); concordance view extended with page numbers
(US-G-03); embedded PDF.js viewer (US-G-04, deferred). Per-page text
is stored at import time even before the viewer is built so users
don't have to re-import their corpus when the viewer ships.

### H. Score — "How does this document rate on my chosen rubric?"

> *Per-document scoring view. The default Scoring Rule is the 5-level
> Wedding Cake Score for the SDG framework. Users can define their own
> Scoring Rules for non-sustainability work (e.g., a NIST CSF Maturity
> rule for cybersecurity research).*

| ID | Story | Status |
|---|---|---|
| US-H-01 | As a researcher, I want each document scored on the active Scoring Rule, so that I have a single defensible number to discuss in my paper. | CONFIRMED |
| US-H-02 | As a researcher, I want to see *why* a document received a particular score — the underlying matrix or coverage table that drove the score — so that the score is auditable, not a black box. | CONFIRMED |
| US-H-03 | As a researcher, I want to define my own Scoring Rules with a clear, simple syntax (without writing code), so that I can apply this app to non-sustainability domains. | CONFIRMED |
| US-H-04 | As a researcher, I want to see a project-level distribution of scores (e.g., how many documents are at Level 0 vs Level 4), so that I can characterise the corpus as a whole. | CONFIRMED |
| US-H-05 | As a sustainability researcher opening a fresh project, I want the 5-level Wedding Cake Score pre-applied so that I see a meaningful score on day one without configuring anything. | CONFIRMED (per principle #9) |
| US-H-06 | As a researcher, I want a **fine-grained pillar-coverage ratio (X/12)** alongside the X/4 tier — partial credit summed across functions — so that a broad-but-shallow document (every function covers 2 of 3 pillars → 0/4 but 6/12) is distinguishable from an empty one (0/4, 0/12). The tier is unchanged. | IMPLEMENTED (v0.26.0; see ADR-0008) |

**Wires to:** new Scoring Rule entity (data model); rule-evaluation
engine; per-document score breakdown view; project-level distribution
chart.

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
| US-X-09 | As a researcher, I want to clone an existing project (its document selection, keywords, axes, scoring rules, settings) into a new project that I can then modify, so that I can experiment with different analysis configurations without losing the original. | CONFIRMED |
| US-X-10 | As a researcher, I want any chart that uses a coarse ML signal (sentiment, semantic similarity, context inference) to display an inline caveat about its precision, so that I don't accidentally over-cite an approximate result. | CONFIRMED (per design principle #8) |
| US-X-11 | As a researcher, I want positive keywords and counter-keywords to live in the same Keyword List, distinguished by a polarity flag rather than maintained as two separate lists, so that the relationship between them is visible (the counter-keyword *for SDG 13* sits next to the positive keywords *for SDG 13*). | CONFIRMED |
| US-X-12 | As a researcher, I want Tag Axes to be first-class entities I can mix and match per project (some come with the Keyword List I picked, others I activate independently), so that the same SDG keyword list can be combined with different lenses (Function, Pillar, Sector) without me forking the keyword list. | CONFIRMED |
| US-X-13 | As a sustainability researcher, I want the SDG keyword list, the Wedding Cake Pillar axis, the Function axis, and the 5-level Wedding Cake Score to be pre-loaded out of the box, so that I can open the app and run a meaningful first analysis without learning the configuration model. | CONFIRMED (per principle #9) |
| US-X-14 | As a researcher with a folder of hundreds of reports, I want to **import a whole folder recursively** (all supported files in it and its subfolders), so that I don't select files one at a time. | IMPLEMENTED (v0.26.0) |
| US-X-15 | As a researcher, I want to **select several documents in the Library and bulk-edit** their type / sector / company / company-size / year (or delete them) in one action, so that I can curate a large Library quickly. | IMPLEMENTED (v0.26.0) |
| US-X-16 | As a researcher, I want to **sort the Library by any column and search** across title / filename / company / sector / type, so that I can find and organise documents in a large Library. | IMPLEMENTED (v0.26.0) |
| US-X-17 | As a researcher, I want the document **type auto-detected on import** (Annual / Sustainability / Integrated / CSR / Climate Report, else "Unknown"), editable afterwards, so that I get a useful facet without manual tagging. | IMPLEMENTED (v0.26.0) |
| US-X-18 | As a researcher, I want to **export a full-project report as a Word (.docx)** document — configuration, document inventory, scores (X/4 + X/12), substance signals, and ranked charts — so that I can drop it into a paper. (One assembler; see ADR-0013 for the three report scopes.) | IMPLEMENTED (v0.26.0) |
| US-X-19 | As a researcher, I want an **optional "AI observations"** action for a single document and for the whole project, which feeds the *deterministic* signals (and, for a document, its text) to my configured AI provider and returns an initial interpretation of what stands out and where to focus — **always flagged AI-generated and not a repeatable signal** (design principle #10). | IMPLEMENTED (v0.26.0) |
| US-X-20 | As a researcher, I want to **configure my own AI provider (BYOK)** — Anthropic / OpenAI / Gemini / Grok / OpenAI-compatible / Ollama — with my key **encrypted** and hidden by default, a connection test, and a model list, so that the optional AI features use a provider I control (including fully-local Ollama). Keys never leave the app's background process (see ADR-0014). | IMPLEMENTED (v0.26.0) |
| US-X-21 | As a researcher **with hundreds of documents**, I want the app to surface the documents most worth looking at first — ranked by how far each **deviates from the rest of the corpus** across the deterministic signals — so that I don't have to read them all to find the notable outliers. (The Focus workflow; motivated by handling 400+ reports. See [`focus-auto-research-mode.md`](focus-auto-research-mode.md) and ADR-0012.) | IMPLEMENTED (v0.27.0) |
| US-X-22 | As a researcher, I want each notable document to **explain why it stands out** (which signals are unusually high/low, and by how many σ) and to see the **per-signal extremes** across the corpus, so that the direction is interpretable and **reproducible** — not a black box. An optional, clearly-flagged AI narration (US-X-19) can interpret the same numbers. | IMPLEMENTED (v0.27.0) |

---

## Implementation status

*Updated for v0.26.0 (2026-07-10). This section is the authoritative record of
what is built; the per-table Status column reflects design confirmation only.*

**New since v0.16.0 (v0.17 → v0.26):**
- **Library management:** recursive folder import (US-X-14), multi-select bulk
  edit (US-X-15), column sort + cross-field search (US-X-16), auto-detected
  document `type` (US-X-17), and the manual `company_size` facet.
- **Substance signals** (deterministic, with confidence): repetition,
  diversity, intensity, evidence-reuse-across-pillars, coverage-spread —
  surfaced as Compare metrics and groupable by type/size (US-B-06…US-B-10).
- **Scoring:** fine-grained X/12 pillar-coverage ratio alongside the X/4 tier
  (US-H-06); scoring generalised to cross-coverage + coverage-count patterns.
- **Map:** radar profile-compare view and a Counts / % toggle on the 2D matrix.
- **Reporting:** full-project DOCX report with tables + charts (US-X-18).
- **AI (opt-in, BYOK):** encrypted provider settings (US-X-20) and AI
  observations for a document and a project, always flagged (US-X-19).
- **Fixes/hardening:** clean-machine resource bundling; Electron security
  boundary (ADR-0015); the lens family now builds against the latest backend
  (ADR-0003).

**Original v0.16.0 record (still accurate):**

**Shipped:** all eight workflows (A Coverage, B Compare, C Track, D
Discover, E Map, F Audit, G Read, H Score) and the cross-cutting stories
(US-X-01 … US-X-13) are implemented, **except** the items listed below.
This includes several stories whose Status column still reads DRAFT or
SPECULATIVE but which in fact shipped — e.g. US-B-01/US-B-03 (Compare,
completeness score), US-C-03 (multi-company trend overlay), US-E-05
(context-inferred Function axis via embedding classification), US-X-03
(import a `.lens` bundle), US-X-07 (bulk-CSV attribute correction).

US-A-04 (accepted synonyms counted toward their parent keyword in
Coverage / Map / Track / Compare / Read) shipped in v0.16.0.

**Not yet built:**
- **US-B-02** — compare a single company across multiple frameworks
  side-by-side. (SPECULATIVE; no current workflow.)

**Shipped since last update:**
- **US-C-02** — now implemented as the **Tone–Substance Gap** workflow tab.
  Plots tone (sentiment) × substance (keyword polarity) at document, section,
  and keyword levels; gap-over-time view shows whether the tone–substance
  delta is widening or closing across the corpus.

**Deferred polish (not full stories):**
- First-run wizard **Cybersecurity focus** is disabled ("Coming soon").
  The cyber framework JSONs exist (`nist-csf`, `iso-27001`, `cis-controls`,
  `mitre-attack`, …) but the seed design — which keyword list, which lenses,
  which scoring rule to pre-load — is not yet defined. Sustainability and
  "Other" focuses work.
- Keyword-list **CSV import** on the Keywords page is "coming soon"
  (document-attribute bulk CSV, US-X-07, is built and lives on the Library
  page — these are different features).

---

## Resolved decisions

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

### 2. ~~Domain list scope~~ → Tag Axis (REVISED 2026-05-11)

**Original decision (superseded):** Domain lists are global, named
entities; one Domain list per Project.

**Revised decision:** "Domain list" was the wrong model. The correct
abstraction is a **Tag Axis** — a dimension along which keyword
mentions can be classified. Some axes are *keyword-attached* (values
defined by keyword definition, e.g., SDG values 1–17); others are
*document-context* (values inferred from where the keyword appears,
e.g., the Function axis from section headings). Projects activate one
or more Tag Axes. The earlier "one Domain list per Project" rule
becomes "one or more Tag Axes per Project, typically including the
Keyword-attached axis that comes with the active Keyword List".

This change was driven by the methodology document, which makes clear
that the researchers' workflow uses *both* a hierarchical SDG
classification (keyword-attached) and an orthogonal Function
classification (context-inferred), simultaneously.

**Affects:** US-E-01 through US-E-05 (rewritten); US-X-12 (new); the
data model section (Tag Axis replaces Domain list); the IA design (the
top-level "Domains" page becomes a "Tag Axes" page or folds into
Settings).

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
  Provenance is preserved.
- Synonyms can be added to **both built-in framework keywords and custom
  keywords** (synonyms are user metadata layered on top of the framework
  definition).
- A separate "Synonym Discovery Report" page shows candidates across all
  keywords in one place for end-to-end review.

**Affects:** US-A-04, US-D-04 through US-D-09; data model.

### 4. Year + company auto-detection (REVISED 2026-05-12)

**Original decision (superseded):** Year auto-detection from filename
only. No PDF content sniffing. Reason at the time: "deterministic,
predictable, no surprises."

**Revised decision:** Layered detection. Filename first (deterministic
and usually right when present), backend content inference as fallback
(robust against generic filenames like `report.pdf` /
`download-final.pdf`), null as the last resort (user edits inline).

| Field | 1st choice | 2nd choice | 3rd choice |
|---|---|---|---|
| `year` | filename year (regex `19[9]\d\|20[0-3]\d`) | backend `inferred.probable_year` from PDF text patterns ("Annual Report 2024", "FY2024", "year ended ... 2024", copyright year) | `null` → user edits |
| `company` | (none — no reliable filename signal) | backend `inferred.probable_company` from PDF text | `null` → user edits |
| `sector` | (none) | (none) | `null` → user edits |

Why the revision: real-world annual reports are routinely named
generically by corporate websites (`AnnualReport.pdf`, `report-final-v3.pdf`,
`asx-300-acmecorp.pdf`). Filename-only detection silently dropped the
year on the first import the user actually tested. Layered detection
keeps the predictability of filename when it works (modern downloads
with year in name) and adds a content-based safety net.

`Document.year` remains `number | null` (not 0000-as-sentinel) and the
inline year edit on the Library page (US-X-06) is unchanged. Bulk-
correction CSV (US-X-07) still on roadmap.

Implementation requires a small `document-analyser` change to expose
the `inferred` block on the `/files/upload-path` route (the inference
logic exists in `_infer_year` / `_infer_company` but is only surfaced
on the multipart `/files/upload` route).

**Affects:** US-C-01, US-C-04, US-X-06, US-X-07; Document data model;
import pipeline.

### 5. Sentiment honesty

**Decision:** Adopted as design principle #8 — every ML-derived signal
(sentiment, embedding similarity, semantic context inference, synonym
suggestions) must carry an inline caveat appropriate to its precision.

**Affects:** US-C-02, US-D-02, US-E-05, US-F-01–F-03, US-X-10.

### 6. Counter-keywords (NEW 2026-05-11)

**Decision:** Counter-keywords are a first-class concept, modelled as a
**polarity** field on each Keyword (`positive` or `counter`), not as a
separate Keyword List. The Universities keyword list (XLSX shared
2026-05-11) ships with both an SDG sheet (positive) and a Non-SDG
sheet (counter, 67 entries like *"Carbon offset reliance (without
reduction)"*) — both kinds of keywords carry the same SDG tag, so
keeping them in the same list under the same SDG axis preserves the
relationship.

The user confirmed researchers actively use the Non-SDG sheet
(2026-05-11), so this is not aspirational — it's required for parity
with the existing methodology.

**Affects:** US-A-05 (polarity filter on Coverage), US-C-05 (positive-
vs-counter trend), US-D-09 (counter-keyword discovery), US-X-11 (data-
model story); data model (Keyword.polarity).

### 7. 2D cross-tabulation as a primary deliverable (NEW 2026-05-11)

**Decision:** The methodology document describes a per-document
table/matrix of *Core Function × SDG Pillar* (or × SDG). This 2D
cross-tabulation is the primary visualisation of workflow E (Map),
*not* a separate workflow.

The user clarified (2026-05-11) that the eventual deliverable is a
**trend over time** showing whether sustainability reporting has
increased or decreased — meaning workflow C (Track) carries the
headline. The 2D cross-tab is intermediate input that produces the
per-document scores which then drive the trend.

**Affects:** US-E-02, US-E-03 (cross-tab views), US-C-05–C-07 (trend
deliverables), US-H-01–H-04 (scoring lives between Map and Track).

### 8. Custom Scoring Rules (NEW 2026-05-11)

**Decision:** Scoring Rules are user-definable entities. The app ships
with the **5-level Wedding Cake Score** as the default rule (Level
N = N of the four Functions deliver Economy + Society + Biosphere SDGs
simultaneously). Users can define their own rules for non-sustainability
domains via a simple no-code rule syntax.

The structure must generalise to other frameworks (cybersecurity, etc.)
even though the current sustainability research is the only validated
use case. This is design principle #9 in concrete form.

**Affects:** US-B-05, US-H-01–H-05, US-X-13; data model (Scoring Rule
entity).

### 9. Track is the headline workflow (NEW 2026-05-11)

**Decision:** Workflow C (Track) is the deliverable-producing workflow
for the sustainability research use case. Specifically, US-C-07
(paper-ready export — chart PNG + methodology blurb + data CSV) is the
critical feature for the paper deliverable the user described.

The remaining workflows feed Track: Coverage / Map produce per-document
data, Score reduces it to a single number, Track plots that number over
time.

**Affects:** US-C-01 through US-C-07; build prioritisation in the IA
doc (Track moves earlier in the build order).

### 10. Sustainability defaults pre-loaded (NEW 2026-05-11)

**Decision:** The app ships with the SDG keyword list (positive +
counter-keywords from the Universities XLSX), the Wedding Cake Pillar
axis (Biosphere / Society / Economy / Partnership), the Function axis
(Teaching / Research / Engagement / Operations), and the 5-level
Wedding Cake Score pre-loaded as a Scoring Rule. A sustainability
researcher opens the app, creates a project, picks documents, and
sees a meaningful first analysis — zero configuration required.

For non-sustainability researchers, all four pre-loaded items can be
ignored; they pick or import their own keyword list, define their own
axes, and write their own scoring rule.

**Affects:** US-X-13, US-H-05; principle #9; first-run experience in
the IA doc.
