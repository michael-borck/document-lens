# Document Lens — Context

Domain and architecture language for Document Lens, a desktop research tool
that analyses document collections through keyword frameworks. This file is
the source of truth for naming; it is grown lazily as terms are resolved
during design work (see the `/improve-codebase-architecture` and
`/grill-with-docs` skills).

## Language

### Scoring

**Scoring Rule**:
A user-configurable rubric that turns a document's keyword/lens evidence into
a level. Its `definition` is an opaque JSON document interpreted at evaluation
time; it admits any number of levels and any combining logic (IA-2).
_Avoid_: rubric (in code), formula.

**Wedding Cake Score**:
The built-in Scoring Rule (`definition.type = "wedding-cake"`): for each
**Function** value, score a point when that function delivers positive matches
in *every* required **Pillar**. The default 5-level sustainability rule.
_Avoid_: SDG score, sustainability score.

**Score Evaluator**:
The deep module that turns a Scoring Rule plus a project's corpus into a
per-document result. The generic `evaluateScore(input)` shell resolves the
rule's evaluation **mode**, selects the coverage matrices an evaluator needs,
and dispatches through the **Rule Evaluator Registry**. Each registered
evaluator owns its full pipeline and exposes a pure inner core
(e.g. `weddingCakeScore(matrix, requiredPillars, functionValues)`) for tests.
_Avoid_: scorer, scoring service, calculateScore.

**Rule Evaluator Registry**:
The dispatch **seam** keyed by `definition.type`. One entry per Scoring Rule
type; Wedding Cake is the first **adapter**. Lets a new rule type plug in
without touching Track, Compare, or the Score page.
_Avoid_: rule map, strategy table.

**Evaluation Trace**:
The generic, renderable explanation a Score Evaluator returns alongside the
number: an ordered list of steps `{ label, status: 'met' | 'unmet' |
'partial', detail, count }`. Track reads the score; Compare flattens the trace
into a bar breakdown; the Score page renders it as the IA's
`WhyThisScorePanel`. Generic on purpose — keeps the registry seam from leaking
rule-type specifics onto the render side.
_Avoid_: breakdown (too vague), explanation blob.

**Mode** *(of a Score Evaluator run)*:
Which path an evaluator takes given the data available. For Wedding Cake:
**full** when every document is Function-classified (uses the 2D Pillar ×
Function matrix), or **v1 / fallback** when classification is incomplete (uses
1D Pillar coverage as a prerequisite proxy). The mode lives *behind* the seam,
inside the evaluator — not in callers.
_Avoid_: fallback flag (when referring to the concept).

### Data access

**Query Registry**:
The keyed-query indirection in `electron/queries.ts`. The renderer sends a
query *key* (e.g. `documents.byProject`) over IPC; the main process resolves
it to SQL it alone holds. The threat model: a compromised renderer can only
invoke registered queries, never inject SQL. Lives under `electron/` so it
stays out of the renderer bundle by construction.
_Avoid_: query map, SQL store.

**DbDriver**:
The swappable adapter behind `db.ts`'s `selectAll`/`runStatement`/etc. The
**seam** that makes the analysis services testable. Two adapters: the **IPC
driver** (production, reads `window.electron`) and the **in-memory adapter**
(tests — `better-sqlite3 :memory:` running the real **Query Registry** against
the extracted pure schema). Swapped via `setDbDriver`.
_Avoid_: db client, repository.

### Supporting terms

**Pillar**:
A value of the Wedding-Cake Pillar **Lens** (Biosphere / Society / Economy /
Partnership), derived from SDG tags. Keyword-attached.

**Function**:
A value of the Function **Lens** (Teaching / Research / Engagement /
Operations), inferred per section by embedding similarity (document-context,
deterministic per model — IA-1).

**Project Corpus**:
The loaded, filtered analysis inputs for one run, behind a single primitive:
`loadProjectCorpus({ projectId, keywordListId, polarity })` →
`{ docs, keywords, termsFor, spansFor, countFor }`. `docs` are usable
documents (non-empty extracted text); `keywords` are enabled keywords for the
polarity; `termsFor(kw)` is the keyword plus accepted synonyms; `spansFor`/
`countFor` give merged concept mentions. Coverage adds lens rollup on top;
Coverage-2D uses `spansFor` for match positions; Gap reuses `docs` + `termsFor`
but counts at section grain. The one source so workflow numbers reconcile by
construction.
_Avoid_: dataset, document set (when you mean this loaded primitive).

**Coverage matrix**:
The per-document keyword-count structure the analysis workflows build.
1D (`CoverageMatrix`, doc × keyword/lens-value) from `computeCoverage`; 2D
(`CoverageMatrix2D`, doc × Pillar × Function) from `computeCoverage2D`.

**Polarity**:
Whether a keyword is **positive** (the topic is being delivered) or
**counter** (the topic is undermined / performatively framed). The Polarity
filter on workflow pages takes `positive | counter | both`. Use **`both`** for
the combined option (label "Both") — *not* `all`; Read's `all` is an outlier
to migrate when `PolaritySelector` lands.
_Avoid_: `all`, sentiment (a different signal).

## Flagged ambiguities

- **"breakdown"** is used loosely in the current code (`Compare` bar segments,
  `Score` per-pillar detail). Prefer **Evaluation Trace** for the
  evaluator's output; reserve "breakdown" for the flattened bar input Compare
  derives from a trace.

## Example dialogue

> **Dev:** Track needs a per-year average score — does it call the Wedding
> Cake math directly?
> **Domain:** No. It calls the **Score Evaluator**. `evaluateScore` resolves
> the **mode**, runs the right evaluator from the **Rule Evaluator Registry**,
> and hands back per-document `{ score, max, trace }`. Track only reads
> `score`.
> **Dev:** And the Score page's pillar-by-pillar panel?
> **Domain:** That's the **Evaluation Trace** rendered generically. If someone
> adds a `weighted-match-sum` rule tomorrow, it emits a trace too and the
> panel renders it for free — the registry seam doesn't leak.
