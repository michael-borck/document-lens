# Architecture Deepening — Implementation Plan

**Date:** 2026-05-23
**Source:** `/improve-codebase-architecture` review + grilling session.
**Vocabulary:** see [`CONTEXT.md`](../../../CONTEXT.md) (Score Evaluator, Rule
Evaluator Registry, Evaluation Trace, Query Registry, DbDriver, Project
Corpus, Polarity).

Four deepening opportunities, each turning a shallow/duplicated module into a
deep one for testability and AI-navigability. The unifying problem: the
workflow computations carry the product's value but reach straight through
`db.ts` into `window.electron`, so the interface is not a reachable test
surface — the only tests today are two pure helpers.

## Build order (dependency-aware)

```
#2 data seam ─► unlocks tests
     ├─► #4 project corpus ─► reconcile-by-construction
     │        └─► #1 score evaluator (collapse ×3 triplication)
#3 run-lifecycle ── renderer-side, parallel ──
```

Land **#2 → #4 → #1** in sequence; **#3** any time in parallel.

---

## Phase #2 — Give the data seam a second adapter (keystone)

**Goal:** make `db.ts`'s interface a reachable test surface without touching
the 20 services that build on it.

### Steps

1. **Extract the pure schema.** New `electron/schema.ts`:
   - Move the `SCHEMA` DDL string and `SCHEMA_VERSION` out of
     `electron/database.ts`. **No Electron imports** in this file.
   - `electron/database.ts` keeps `app`/`path`/`fs`/wipe-on-bump logic and
     imports `SCHEMA`, `SCHEMA_VERSION` from `electron/schema.ts`.
2. **Define the seam in `src/services/db.ts`:**
   ```ts
   export interface DbDriver {
     select<T>(key: string, params?: unknown[]): Promise<T[]>
     run(key: string, params?: unknown[]): Promise<DatabaseResult>
     update(table: string, columns: string[], idColumn: string, params: unknown[]): Promise<DatabaseResult>
     selectIn<T>(key: string, ids: unknown[]): Promise<T[]>
   }
   let driver: DbDriver = ipcDriver
   export function setDbDriver(d: DbDriver) { driver = d }
   export function resetDbDriver() { driver = ipcDriver }
   ```
   - `ipcDriver` wraps `window.electron` (today's `api()` logic).
   - Re-point `selectAll`/`selectOne`/`runStatement`/`updateRow`/`selectInList`
     to call `driver.*`. **Services unchanged — zero edits.**
3. **In-memory adapter (test util)** — `src/services/_shared/test-db.ts`:
   - `import Database from 'better-sqlite3'`; `import { SCHEMA } from '../../../electron/schema'`;
     `import { getQuery, getInQuery, buildUpdate } from '../../../electron/queries'`.
   - `new Database(':memory:')`; `db.exec(SCHEMA)`. Implement `DbDriver` over
     `getQuery`/`getInQuery`/`buildUpdate`, wrapping sync better-sqlite3 calls
     in `Promise.resolve(...)`. Returns **raw rows** (service layer still does
     `parseJson`/`dbBool`), exactly like the IPC driver.
   - Export `seed(db)` helper to insert minimal fixtures (project, documents
     with `extracted_text`, keyword_list, keywords + polarity, lens +
     lens_values, keyword_tags, project_documents, sections + section_lens_tags
     for classification fixtures).
4. **Test config** — `vitest.config.ts` stays `environment: 'node'` for
   service tests (better-sqlite3 needs node). No change needed for Phase #2.

### Tests (new)

- `db.test.ts` — swap to in-memory driver, seed, assert
  `selectAll('documents.byProject', [pid])` returns the seeded rows;
  `runStatement` reports `changes`; `selectInList` expands `__IN__`;
  `updateRow` respects the column allowlist (rejects a disallowed column).
- `coverage.test.ts` (first real service test) — seed a doc with known text +
  keywords; assert `computeCoverage` counts. **Proves the surface is reachable
  end-to-end.**

### Done when

The in-memory adapter runs the **real** Query Registry; one service test
passes against seeded data; SQL still lives only under `electron/`.

---

## Phase #4 — Consolidate per-document match counting (Project Corpus)

**Goal:** one loaded corpus so Coverage/Track/Compare numbers reconcile by
construction. Depends on #2 for tests.

### Steps

1. **New `src/services/_shared/project-corpus.ts`:**
   ```ts
   loadProjectCorpus({ projectId, keywordListId, polarity }) -> {
     docs: Document[]                       // usable: non-empty extractedText
     keywords: Keyword[]                    // enabled, filtered by polarity ('positive'|'counter'|'both')
     termsFor(kw): string[]                 // keyword + accepted synonyms
     spansFor(docId, kwId): MatchSpan[]     // merged concept mentions (memoised)
     countFor(docId, kwId): number          // spansFor(...).length
   }
   ```
   - Loads docs via `documents.byProject` → `rowToDocument` → filter; keywords
     via `listKeywords` + polarity; synonyms via
     `listEnabledSynonymsForKeywords` once; counting via `findConceptSpans`.
2. **Refactor onto the corpus (delete the duplicated preludes):**
   - `coverage.ts` — replace `loadProjectDocuments` + keyword/synonym loading +
     count loop with corpus; **keep** the lens rollup on top.
   - `track.ts` — `computePerDocumentMeasure` (match-count / coverage-percent
     branch) → corpus.
   - `compare.ts` — match-count / distinct-keywords / pos-minus-counter → corpus.
   - `coverage-2d.ts` — use `corpus.spansFor` for match positions + `docs`;
     keep section/tag placement.
   - `gap.ts` — `buildSections` reuses `corpus.docs` + `termsFor`
     (section-grain counting stays local; it works below doc grain).
3. Remove the now-dead `loadProjectDocuments`/`termsFor` copies.

### Tests (new)

- `project-corpus.test.ts` — usable-doc filter; polarity filter; `termsFor`
  folds synonyms; `countFor` merges overlapping spans (no double-count);
  `spansFor` positions.
- `reconciliation.test.ts` — **the headline test:** for one seeded project,
  Coverage's total for a keyword == Σ Track match-count across years ==
  Compare match-count. Proves the numbers can't drift.

### Done when

The five services share one corpus; the reconciliation test passes.

---

## Phase #1 — Deepen the Score evaluator

**Goal:** collapse the triplicated Wedding-Cake scoring + mode-decision into one
deep module. Pure core testable immediately; e2e after #2.

### Steps

1. **Types** (in `src/types/data.ts` or a new `scoring` module):
   ```ts
   type TraceStatus = 'met' | 'unmet' | 'partial'
   interface TraceStep { label: string; status: TraceStatus; detail: string; count: number }
   interface DocScore { score: number; max: number; trace: TraceStep[] }
   type ScoreEvaluator = (ctx: ScoreContext, def: ScoringRuleDefinition)
       => Promise<{ mode: string; perDocument: Map<string, DocScore> }>
   ```
2. **Pure core** — `src/services/_shared/wedding-cake.ts`:
   - `weddingCakeFull(cells, requiredPillars, functionValues): DocScore`
     (today's `functionStatusForDoc`, returning a trace of function steps).
   - `weddingCakeV1(lensTotals, requiredPillars): DocScore`
     (today's `v1PillarStatus`, trace of pillar steps).
3. **Evaluator + registry** — `src/services/scoring.ts`:
   - `weddingCakeEvaluator`: resolves **mode** via `getClassificationStatus`,
     picks `computeCoverage` (v1) or `computeCoverage2D` (full), maps each
     doc through the pure core.
   - `const REGISTRY: Record<string, ScoreEvaluator> = { 'wedding-cake': weddingCakeEvaluator }`.
   - `evaluateScore({ projectId, keywordListId, scoringRule, polarity })` —
     looks up `REGISTRY[definition.type]` (throws "unsupported rule type"
     otherwise), returns `{ mode, perDocument }`.
   - `scoring-rules.ts` stays CRUD-only.
4. **Collapse callers:**
   - `Score.tsx` — `handleRun` calls `evaluateScore`; delete
     `functionStatusForDoc`/`v1PillarStatus`/`v1PillarStatus`; render
     `trace` generically as `WhyThisScorePanel`; histogram from per-doc scores.
   - `track.ts` — score branch of `computePerDocumentMeasure` → `evaluateScore`
     (drop inline classification check + matrix selection + counting).
   - `compare.ts` — score branch → `evaluateScore`; derive bar `breakdown` by
     flattening the trace.

### Tests (new)

- `wedding-cake.test.ts` (pure, **runs without #2**): full mode — all / none /
  partial functions satisfy; v1 mode — pillar counts; doc absent from matrix;
  zero required pillars; trace `status`/`count` correctness.
- `scoring.test.ts` (e2e via #2 adapter): mode = `full` when all docs
  classified, `v1` otherwise (classification fixtures); registry throws on
  unknown `definition.type`.

### Done when

One `evaluateScore` call serves Score/Track/Compare; pure-core tests green;
mode detection covered.

---

## Phase #3 — Deepen the run-lifecycle (renderer-side, parallel)

**Goal:** kill the per-page run/error/empty/banner scaffolding and the
Gap-only cancel-safety guard. Scoped to the hook + two IA controls — **not** a
generic page shell (result views differ legitimately).

### Steps

1. **`src/hooks/useAnalysis.ts`:**
   ```ts
   useAnalysis(fn, opts?) -> { run, running, error, result, progress, reset }
   ```
   - `run(...args)` clears prior result, sets `running`, `try/catch/finally`.
   - **Cancel-safe:** internal incrementing run-id + mounted ref; only the
     latest run commits state.
   - `opts.deps` → auto-run via `useEffect` (Gap, Read).
   - `fn` receives an `onProgress` reporter; exposed as `progress` (Audit,
     Discover). Coverage's dual-polarity `Promise.all` lives inside its `fn`.
2. **`src/components/workflow/PolaritySelector.tsx`** — `value`/`onChange`/
   `options`, standardized on `positive | counter | both` (label "Both").
   Migrate **Read's `all` → `both`**.
3. **`src/components/workflow/MLCaveatBanner.tsx`** — generic container: yellow
   styling + dismiss + per-session memory keyed by `id`; copy passed as
   children.
4. **Migrate pages incrementally** (one PR per page is fine): replace
   hand-rolled `running`/`error`/`result` state + run buttons + inlined
   polarity selects + banners.

### Test config change (needed for this phase only)

- Add dev deps: `jsdom`, `@testing-library/react`, `@testing-library/dom`.
- `vitest.config.ts`: keep `environment: 'node'` default (services need it);
  add `environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']]` and broaden
  `include` to also match `src/**/*.test.tsx`.

### Tests (new)

- `useAnalysis.test.tsx` — stale result from a superseded run is ignored;
  unmount mid-run doesn't `setState`; error path sets `error`, clears
  `running`; `progress` updates; `deps` change auto-runs.
- `PolaritySelector.test.tsx`, `MLCaveatBanner.test.tsx` — option set; dismiss
  persists per session by `id`.

### Done when

The 9 pages share `useAnalysis`; cancel-safety holds everywhere;
`PolaritySelector`/`MLCaveatBanner` exist and are adopted.

---

## Net effect

- First **real domain tests** in the codebase (build-order Phase 6 #20:
  "real test coverage (currently zero)").
- Scoring math, corpus counting, and the run-lifecycle each become **deep**:
  one interface, one place to test, callers shrink.
- `CONTEXT.md` is the naming source of truth for all new modules.
