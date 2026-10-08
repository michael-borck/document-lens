# ADR-0037: Per-keyword match mode — literal by default, opt-in prefix (stem) matching

**Status:** Accepted (implemented)
**Date:** 2026-10-08
**Deciders:** Michael Borck (with Claude)
**Evidence:** `src/services/_shared/keyword-match.ts` (the single matching seam); `src/data/frameworks/sdgs.json` (variants enumerated by hand); `docs/adr/0035` (determinism ladder); conversation 2026-10-08

## Context

Keyword matching is literal regex: single-token keywords match whole words
(`\bpetrol\b`), multi-token keywords match literal phrases. Inflectional
variants therefore count as **zero** mentions — "sustainable" does not count
for keyword "sustainability". The shipped lists already pay for this: the SDG
default enumerates variants by hand (`ecosystem` **and** `ecosystems` appear
as separate entries in `sdgs.json`), and researchers building custom lists
must either do the same or accept systematic undercounting.

Classical NLP offers stemming (Porter/Snowball) and lemmatisation, and
content-analysis dictionaries (LIWC, DICTION, AntConc) have long used
wildcard/stem matching for exactly this problem. But this app's contract is
**deterministic, transparent, auditable** signals (ADR-0035): every count
must be explainable as "this text matched this term". An automatic stemmer
silently changes every count, is opaque to a researcher auditing a number,
and misfires on domain vocabulary — `govern*` fires on *government*, a false
positive in a *governance* framework; Porter collides *university* with
*universal*.

## Decision

Add a per-keyword **match mode** with two values:

- **`exact`** (default) — today's behaviour, unchanged.
- **`prefix`** — the keyword matches any word *beginning with* the keyword
  text: `sustainability` matches *sustainable, sustainably, sustainability's*.
  Word-start boundary is kept, so *unsustainable* does **not** fire for
  `sustainable`. Multi-token keywords match as a phrase whose end may extend
  with word characters — type the stem you want: `water secur` matches
  *water security* and *water securing*. Prefix never bridges stem changes
  (`clean energy` does not catch *clean energies*); a researcher wanting that
  lists the variant or types the shorter stem.

Rules that keep the audit trail intact:

- The mode is **an explicit, per-keyword researcher choice** (a column on the
  keyword row, editable in the Keywords page, carried in CSV and bundle
  export/import) — never a global automatic stemmer.
- The mode applies to **the keyword's own text only**; accepted synonyms
  always match exactly (they are already explicit researcher choices).
- Concordance, per-mention export, and suppression all operate on the
  **matched span**, so the actual surface form that fired is always displayed
  and auditable, whatever the mode.

## Alternatives considered

- **Automatic stemming/lemmatisation of all keywords** — rejected: silently
  changes counts, breaks explainability, and produces domain false positives
  the researcher never opted into.
- **In-text wildcard syntax** (`sustain*` as the keyword text) — rejected:
  overloads the text field that CSV, bundles, dedupe checks, and the synonym
  discoverer treat as literal content; the mode is metadata, not content.
- **Do nothing; enumerate variants as keywords/synonyms** — rejected as the
  status quo that motivated this ADR: hundreds of hand-maintained variant
  entries across the shipped lists, and unbounded work for custom lists.

## Consequences

- Coverage, Map, Read, Discover, Score, Track, Compare, Audit, Gap, and Focus
  all count prefix-mode keywords consistently, because every one of them goes
  through the shared matcher (`keyword-match.ts`) or the Project Corpus.
- Numbers are still deterministic and recomputable: the mode is stored with
  the keyword, so the same inputs always produce the same counts.
- A prefix keyword can over-match (`govern*` → *government*); the existing
  mitigations are the right ones — researcher judgement when choosing the
  mode, exclusion phrases for sentence-level vetoes, and per-instance span
  suppression.
- Schema bump (greenfield wipe) required: `keywords.match_mode` column,
  `SCHEMA_VERSION` 7 → 8.
- Future lemmatisation (backend spaCy) can slot in as an additional mode
  value behind the same seam without touching the workflows.
