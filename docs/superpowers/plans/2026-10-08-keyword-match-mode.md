# Keyword Match Mode — Implementation Plan

**Date:** 2026-10-08
**Decision:** [ADR-0037](../../adr/0037-keyword-match-mode.md) — per-keyword
match mode, `exact` (default) | `prefix` (stem-style word-start matching).
**Vocabulary:** see [`CONTEXT.md`](../../../CONTEXT.md) (Query Registry,
DbDriver, Project Corpus, Match Mode).

## The shape of the change

One new column, one matcher seam, thread the mode to four direct call sites.
Everything else (Coverage, Map, Score, Track, Compare, Audit, Gap, Focus,
per-mention export) counts through the Project Corpus, so it inherits the
mode for free.

```
schema v8 (keywords.match_mode)
     ├─► queries.ts registry ─► npm run gen:rust-db (Rust twin)
     ├─► types/data.ts Keyword.matchMode
     └─► keyword-lists.ts row mapping / create / update
              └─► matcher seam (keyword-match.ts, mode param)
                       ├─► project-corpus.ts spansFor (kw.matchMode)
                       ├─► concordance.ts (FindConcordanceInput.matchMode)
                       ├─► gap.ts (2 direct findConceptSpans sites)
                       └─► Read.tsx (countConcept + findConcordance)
UI:  Keywords.tsx (add-row select, edit-row select, prefix badge)
I/O: keyword-csv.ts (match_mode column), bundle export/import
```

## Steps (dependency-aware)

1. **Schema** — `src/db/schema.ts`: add
   `match_mode TEXT NOT NULL DEFAULT 'exact' CHECK(match_mode IN ('exact','prefix'))`
   to `keywords`; `SCHEMA_VERSION` 7 → 8 with a history note. Greenfield wipe
   re-seeds everything (ADR-0004).
2. **Registry** — `src/db/queries.ts`: `keywords.create` gains the column;
   `UPDATABLE_COLUMNS.keywords` gains `'match_mode'`. Then
   `npm run gen:rust-db` so the Rust twin stays drift-free (CI checks it).
3. **Types** — `src/types/data.ts`: `KeywordMatchMode = 'exact' | 'prefix'`;
   `Keyword.matchMode`.
4. **Service layer** — `src/services/keyword-lists.ts`: `KeywordRow` +
   `rowToKeyword`; `CreateKeywordInput.matchMode?`;
   `UpdateKeywordInput.matchMode?` (+ patch branch).
5. **Matcher seam** — `src/services/_shared/keyword-match.ts`:
   - `buildTermPattern(term, mode='exact')`: prefix mode → word-start
     anchored, `\w*`-extended (`\bsustain\w*`); multi-token prefix matches
     the phrase and lets the end extend with word characters — type the
     stem you want (`water secur` → *water security*).
   - `findTermSpans(text, term, mode?)`.
   - `findConceptSpans(text, terms, keywordMode='exact')` — mode applies to
     `terms[0]` (the keyword) **only**; synonyms stay exact. Overlap merge
     unchanged, so keyword `sustain*` + synonym still dedupes to one mention.
   - `countConcept(text, terms, keywordMode?)`.
6. **Thread the mode** —
   - `project-corpus.ts`: `spansFor` passes `kw.matchMode`.
   - `concordance.ts`: `FindConcordanceInput.matchMode?`.
   - `gap.ts`: both direct sites pass `kw.matchMode`.
   - `Read.tsx`: `countConcept(..., k.matchMode)` and
     `findConcordance({ ..., matchMode: keyword.matchMode })`.
7. **UI** — `src/pages/Keywords.tsx`: match-mode `Select` in the add-keyword
   row and the edit row; a subtle "prefix" badge on keyword rows so the mode
   is visible without expanding.
8. **I/O round-trips** —
   - `keyword-csv.ts`: export a `match_mode` column; import it forgivingly
     (missing/unknown → `exact`).
   - `bundle-project-export.ts` / `bundle-project-import.ts`: carry
     `matchMode` in `BundleKeyword`; older bundles import as `exact`.
9. **Tests** —
   - `keyword-match.test.ts`: prefix hits inflections, rejects
     mid-word/preceded-by-letters cases, multi-token prefix, synonym-stays-
     exact, overlap dedup with prefix keyword.
   - `project-corpus.test.ts`: a prefix keyword counts inflections through
     `countFor` (proves the corpus threads the mode).
   - `keyword-csv.test.ts`: header round-trip with `match_mode`.
10. **Docs** — CONTEXT.md gains the **Match Mode** term; README data-model
    paragraph gains a sentence.

## Verification

```bash
npm run gen:rust-db   # after steps 1–2
npm run lint          # eslint src
npm run typecheck     # tsc --noEmit
npm test              # vitest — includes the new cases
```

## Deliberately out of scope

- Lemmatization as a third mode (backend spaCy) — the seam admits it later.
- Synonym discovery suggesting inflectional single words (closes the v1
  "n-grams only" gap) — follow-up, not needed for the mode itself.
- Match-mode column in per-mention / export-all CSVs — the matched text is
  already exported; mode is visible on the keyword row.
