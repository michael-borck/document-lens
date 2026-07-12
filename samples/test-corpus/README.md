# Synthetic test corpus

A fictional corpus of annual and sustainability reports, designed to exercise
the notability / substance signals (repetition, diversity, intensity,
evidence reuse, coverage) and trends over time. See **ADR-0028** for the
decisions behind it. Every organisation, person, and figure is invented, and
each document says so on its face.

## Layout

- `docs/*.md` — the committed sources. Frontmatter carries the document
  attributes (company, year, sector, company size, type); the body is real
  prose authored against the **shipped seed keyword set**
  (`src/data/sustainability-keywords.json`), so a clean install exercises the
  full pipeline with zero configuration.
- `corpus-manifest.json` — the machine-readable expectations: what each
  document is designed to demonstrate, as *relative* orderings, trends, and
  generous bands (never exact values, so signal formulas can be tuned without
  rewriting the corpus).
- `pdf/` — build output, gitignored. Regenerate any time with
  `npm run build:corpus` (renders Markdown → PDF via Playwright Chromium).

## What each document tests

| Document | Role |
|---|---|
| Helios Energy Group 2020–2024 | Rising trend: intensity and diversity ramp year over year (Large / Energy) |
| Meridian Regional Bank 2021–2023 | Declining trend: sustainability language recedes as cost language grows (Medium / Financial Services) |
| Bluegum Grocers 2024 | High repetition + low diversity: a narrow, honest report (Small / Retail) |
| Veridia Metals 2023 | Greenwashing exemplar: repeated slogans, multi-SDG buzzwords (high evidence reuse), counter keywords beneath the gloss |
| Southern Forge 2023 | Substantive counterpart to Veridia: specific, varied, measured, zero counter keywords |
| Atlas University 2024 | Broad coverage: all four pillars across all four university functions |
| Narrow Waters Institute 2024 | Concentrated coverage: biosphere-pillar language only |

## Verifying expectations

`src/services/test-corpus.test.ts` executes the manifest with the same pure
signal functions the app uses (`substance.ts`, `keyword-match.ts`) over the
seed keywords — run with the normal test suite (`npm test`).

Two notes for in-app use:

- **Evidence reuse** requires keywords tagged to more than one SDG; the seed
  ships every keyword single-tagged. `corpus-manifest.json` →
  `extra_sdg_tags` lists the cross-cutting buzzwords to tag with a second SDG
  — and its corresponding Pillar — on the Keywords page before exercising
  this signal in the app. The unit test and `e2e/corpus.spec.ts` apply them
  automatically.
- **Coverage spread / Wedding Cake scoring** additionally need section
  classification (embedding-based, in-app). The documents are structured with
  clear Teaching / Research / Engagement / Operations-flavoured sections so
  classification has real material to work with; the unit test asserts the
  pillar dimension only.
