# Tone–Substance Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Gap" workflow tab that plots each document/section/keyword as a point in tone (sentiment) × substance (keyword polarity) space, surfacing where upbeat language outruns delivery substance (greenwashing), plus a gap-over-time trend.

**Architecture:** Pure metric math in `gap-math.ts` (unit-tested with vitest). Orchestration in `gap.ts`: substance computed locally via the existing synonym-aware matcher; tone computed once per section via the backend `analyzeSentimentBatch` and cached in `analysis_cache`; all three levels derived from section data. Presentation in `Gap.tsx` + two chart components, mirroring the existing workflow-page + recharts patterns.

**Tech Stack:** TypeScript, React 18, recharts 2.15, Electron IPC (keyed query registry), document-analyser backend (`/semantic/sentiment/batch`), vitest (new, pure-math only).

**Spec:** `docs/superpowers/specs/2026-05-21-tone-substance-gap-design.md`

---

## File structure

- Create `vitest.config.ts` — node-env test config scoped to `src/**/*.test.ts`.
- Modify `package.json` — add `vitest` devDep + `test` / `test:watch` scripts.
- Create `src/services/_shared/gap-math.ts` — pure metric functions.
- Create `src/services/_shared/gap-math.test.ts` — vitest unit tests.
- Create `src/services/_shared/keyword-match.test.ts` — span-dedup tests (gap depends on it).
- Modify `electron/queries.ts` — add generic `analysisCache.get` / `analysisCache.put`.
- Create `src/services/gap.ts` — orchestration + `computeGap()` + over-time aggregation.
- Create `src/components/gap/GapScatter.tsx` — scatter explorer (tabs, colors, diagonal, toggle).
- Create `src/components/gap/GapOverTime.tsx` — over-time line + sufficiency guard.
- Create `src/pages/workflow/Gap.tsx` — page: backend-required gate, caveat, composes the two charts.
- Modify `src/components/project/WorkflowTabs.tsx` — add the Gap tab.
- Modify `src/App.tsx` — add lazy import + route.
- Modify `src/pages/Help.tsx` — Gap help section (rationale + quadrant table).
- Modify `src/data/frameworks/KEYWORD_METHODOLOGY.md` — methodology rationale + table.
- Modify `docs/design/user-stories.md` — update US-C-02 to the gap reframing.

---

## Task 1: vitest infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add vitest + scripts to package.json**

Add to `devDependencies`: `"vitest": "^2.1.8"`. Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create vitest.config.ts**

Standalone config (do NOT extend vite.config.ts — it loads the electron plugins). Node environment; the math is pure, no DOM.
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Install + verify the runner**

Run: `npm install`
Then: `npm test`
Expected: vitest runs and reports "no test files found" (tests come next) — exit 0 or the no-tests notice, no config error.

- [ ] **Step 4: Commit**
```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(test): add vitest for pure-function unit tests"
```

---

## Task 2: Pure metric math (`gap-math.ts`) — TDD

**Files:**
- Create: `src/services/_shared/gap-math.ts`
- Test: `src/services/_shared/gap-math.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/services/_shared/gap-math.test.ts
import { describe, it, expect } from 'vitest'
import { substanceRatio, gapFromDiagonal, fitLine, gapFromResidual } from './gap-math'

describe('substanceRatio', () => {
  it('returns null when there are no matches', () => {
    expect(substanceRatio(0, 0)).toBeNull()
  })
  it('+1 when all positive, -1 when all counter', () => {
    expect(substanceRatio(5, 0)).toBe(1)
    expect(substanceRatio(0, 5)).toBe(-1)
  })
  it('0 when balanced', () => {
    expect(substanceRatio(3, 3)).toBe(0)
  })
})

describe('gapFromDiagonal', () => {
  it('is tone minus substance (positive = performative)', () => {
    expect(gapFromDiagonal(0.8, -0.5)).toBeCloseTo(1.3)
    expect(gapFromDiagonal(-0.2, 0.6)).toBeCloseTo(-0.8)
  })
})

describe('fitLine', () => {
  it('returns null with fewer than 2 points', () => {
    expect(fitLine([{ substance: 0, tone: 0 }])).toBeNull()
  })
  it('recovers slope and intercept of a clean line', () => {
    const line = fitLine([
      { substance: 0, tone: 1 },
      { substance: 1, tone: 2 },
      { substance: 2, tone: 3 },
    ])
    expect(line!.slope).toBeCloseTo(1)
    expect(line!.intercept).toBeCloseTo(1)
  })
  it('returns null when all x identical (degenerate)', () => {
    expect(fitLine([{ substance: 1, tone: 0 }, { substance: 1, tone: 1 }])).toBeNull()
  })
})

describe('gapFromResidual', () => {
  it('is distance from the fitted line', () => {
    const line = { slope: 1, intercept: 1 }
    expect(gapFromResidual(2.5, 1, line)).toBeCloseTo(0.5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `gap-math` module / exports not found.

- [ ] **Step 3: Implement gap-math.ts**

```ts
// src/services/_shared/gap-math.ts
/**
 * Pure metric math for the Tone–Substance Gap. No I/O. Substance and tone
 * are each normalized to -1..+1; the gap is the signed distance from a
 * reference line (positive = tone ahead of substance = performative).
 */

export type GapReference = 'diagonal' | 'residual'

/** Net keyword polarity as a ratio in -1..+1, or null if no matches. */
export function substanceRatio(positiveMatches: number, counterMatches: number): number | null {
  const total = positiveMatches + counterMatches
  if (total === 0) return null
  return (positiveMatches - counterMatches) / total
}

/** Absolute gap from the ideal 1:1 diagonal. */
export function gapFromDiagonal(tone: number, substance: number): number {
  return tone - substance
}

/** Least-squares fit of tone ~ substance. Null if <2 points or x-variance is 0. */
export function fitLine(
  points: Array<{ substance: number; tone: number }>
): { slope: number; intercept: number } | null {
  const n = points.length
  if (n < 2) return null
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const p of points) {
    sx += p.substance; sy += p.tone
    sxx += p.substance * p.substance; sxy += p.substance * p.tone
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}

/** Residual gap from a fitted corpus line. */
export function gapFromResidual(
  tone: number,
  substance: number,
  line: { slope: number; intercept: number }
): number {
  return tone - (line.slope * substance + line.intercept)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all gap-math tests green).

- [ ] **Step 5: Commit**
```bash
git add src/services/_shared/gap-math.ts src/services/_shared/gap-math.test.ts
git commit -m "feat(gap): pure tone-substance metric math with tests"
```

---

## Task 3: Backfill span-dedup tests for the shared matcher

Gap's substance/tone both depend on `findConceptSpans` dedup. Lock its behavior.

**Files:**
- Test: `src/services/_shared/keyword-match.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// src/services/_shared/keyword-match.test.ts
import { describe, it, expect } from 'vitest'
import { countConcept, findConceptSpans } from './keyword-match'

describe('findConceptSpans dedup', () => {
  it('counts a plain keyword normally', () => {
    expect(countConcept('energy and more energy', ['energy'])).toBe(2)
  })
  it('does not double-count a synonym overlapping the keyword', () => {
    // "clean energy" contains "energy"; one mention, not two
    expect(countConcept('we invest in clean energy', ['energy', 'clean energy'])).toBe(1)
  })
  it('counts separate mentions across keyword + synonym', () => {
    expect(countConcept('energy. later, clean energy', ['energy', 'clean energy'])).toBe(2)
  })
  it('returns spans sorted by start', () => {
    const spans = findConceptSpans('clean energy then energy', ['energy', 'clean energy'])
    expect(spans.map((s) => s.start)).toEqual([...spans.map((s) => s.start)].sort((a, b) => a - b))
  })
})
```

- [ ] **Step 2: Run + verify pass** (the implementation already exists)

Run: `npm test`
Expected: PASS. If any fail, the dedup in `keyword-match.ts` regressed — fix there, do not weaken the test.

- [ ] **Step 3: Commit**
```bash
git add src/services/_shared/keyword-match.test.ts
git commit -m "test(gap): lock synonym span-dedup behavior the gap metric relies on"
```

---

## Task 4: Generic analysis_cache queries

`analysis_cache` already exists (used by Audit). Add generically-named keyed queries so `gap.ts` doesn't borrow audit's keys.

**Files:**
- Modify: `electron/queries.ts`

- [ ] **Step 1: Add the queries**

In the registry object (near the `audit.*` cache entries) add:
```ts
  'analysisCache.get':
    'SELECT result FROM analysis_cache WHERE project_id = ? AND cache_key = ?',
  'analysisCache.put': `INSERT INTO analysis_cache (project_id, cache_key, result, computed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (project_id, cache_key)
       DO UPDATE SET result = excluded.result, computed_at = excluded.computed_at`,
```

- [ ] **Step 2: Verify build (electron bundle picks up the registry)**

Run: `npm run build:vite`
Expected: builds clean.

- [ ] **Step 3: Commit**
```bash
git add electron/queries.ts
git commit -m "feat(gap): generic analysis_cache get/put queries"
```

---

## Task 5: `gap.ts` — substance + section datasets (local, no sentiment yet)

**Files:**
- Create: `src/services/gap.ts`

- [ ] **Step 1: Implement types + local computation**

```ts
// src/services/gap.ts
import { selectAll, selectOne, runStatement } from './db'
import { listKeywords, getKeywordListLenses, listEnabledSynonymsForKeywords } from './keyword-lists'
import { detectSections } from './sections'
import { type DocumentRow, rowToDocument } from './_shared/document-row'
import { findConceptSpans } from './_shared/keyword-match'
import {
  substanceRatio, gapFromDiagonal, fitLine, gapFromResidual, type GapReference,
} from './_shared/gap-math'
import { api } from './api'
import type { Document, Keyword } from '@/types/data'

export type GapLevel = 'document' | 'section' | 'keyword'

export interface GapPoint {
  id: string
  label: string
  documentId: string
  documentLabel: string
  substance: number
  tone: number
  gap: number
  weight: number      // keyword match frequency (1 for doc/section)
}

export interface GapDataset {
  byLevel: Record<GapLevel, GapPoint[]>
  overTime: Array<{ year: number; avgGap: number; count: number }>
  overTimeAvailable: boolean
  singleDocument: boolean
}

interface SectionData {
  documentId: string
  documentLabel: string
  index: number
  text: string
  start: number
  end: number
  positive: number   // positive-keyword matches in this section
  counter: number    // counter-keyword matches in this section
  tone: number       // filled in Task 6
}

function docLabel(d: Document): string {
  return d.title || d.company || d.filename
}

/** Per-document detected sections with local positive/counter match counts. */
async function buildSections(docs: Document[], keywords: Keyword[]): Promise<SectionData[]> {
  const synByKw = await listEnabledSynonymsForKeywords(keywords.map((k) => k.id))
  const out: SectionData[] = []
  for (const doc of docs) {
    const text = doc.extractedText ?? ''
    if (!text) continue
    const sections = detectSections(text)
    for (const sec of sections) {
      let positive = 0, counter = 0
      for (const kw of keywords) {
        const terms = [kw.text, ...(synByKw.get(kw.id) ?? [])]
        const n = findConceptSpans(sec.text, terms).length
        if (n === 0) continue
        if (kw.polarity === 'counter') counter += n
        else positive += n
      }
      out.push({
        documentId: doc.id, documentLabel: docLabel(doc), index: sec.index,
        text: sec.text, start: sec.startOffset, end: sec.endOffset,
        positive, counter, tone: 0,
      })
    }
  }
  return out
}

export { buildSections, docLabel, substanceRatio, gapFromDiagonal, fitLine, gapFromResidual }
export type { SectionData, GapReference }
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build:vite`
Expected: clean. (No behavior to smoke yet.)

- [ ] **Step 3: Commit**
```bash
git add src/services/gap.ts
git commit -m "feat(gap): local substance + section dataset scaffolding"
```

---

## Task 6: `gap.ts` — section sentiment via backend + cache

**Files:**
- Modify: `src/services/gap.ts`

- [ ] **Step 1: Add cached sentiment fetch**

Add imports already present (`api`, `selectOne`, `runStatement`). Append:
```ts
function hashSections(secs: SectionData[]): string {
  // cheap stable hash of section boundaries — recompute if text/sections change
  let h = 0
  const key = secs.map((s) => `${s.documentId}:${s.index}:${s.start}-${s.end}`).join('|')
  for (let i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) | 0 }
  return String(h)
}

/** Fill section tones via the backend, cached per project+section-set. */
async function fillSectionTones(projectId: string, secs: SectionData[]): Promise<void> {
  if (secs.length === 0) return
  const cacheKey = `gap-sentiment:${hashSections(secs)}`
  const cached = await selectOne<{ result: string }>('analysisCache.get', [projectId, cacheKey])
  if (cached) {
    const scores: Record<string, number> = JSON.parse(cached.result)
    secs.forEach((s, i) => { s.tone = scores[String(i)] ?? 0 })
    return
  }
  const resp = await api.analyzeSentimentBatch(
    secs.map((s, i) => ({ id: String(i), text: s.text }))
  )
  const scores: Record<string, number> = {}
  for (const r of resp.results) scores[r.id] = r.sentiment.score
  secs.forEach((s, i) => { s.tone = scores[String(i)] ?? 0 })
  await runStatement('analysisCache.put', [
    projectId, cacheKey, JSON.stringify(scores), new Date().toISOString(),
  ])
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build:vite`
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add src/services/gap.ts
git commit -m "feat(gap): section sentiment via backend batch, cached in analysis_cache"
```

---

## Task 7: `gap.ts` — assemble datasets + over-time + entry point

**Files:**
- Modify: `src/services/gap.ts`

- [ ] **Step 1: Add the assembly + computeGap entry point**

```ts
const RESIDUAL_MIN_POINTS = 8

function buildPoints(
  secs: SectionData[], docs: Document[], level: GapLevel, reference: GapReference
): GapPoint[] {
  // raw (substance, tone) pairs depending on level
  type Raw = { id: string; label: string; documentId: string; documentLabel: string; substance: number; tone: number; weight: number }
  const raws: Raw[] = []

  if (level === 'section') {
    for (const s of secs) {
      const sub = substanceRatio(s.positive, s.counter)
      if (sub === null) continue
      raws.push({ id: `${s.documentId}:${s.index}`, label: `${s.documentLabel} §${s.index + 1}`,
        documentId: s.documentId, documentLabel: s.documentLabel, substance: sub, tone: s.tone, weight: 1 })
    }
  } else if (level === 'document') {
    const byDoc = new Map<string, SectionData[]>()
    for (const s of secs) { const a = byDoc.get(s.documentId) ?? []; a.push(s); byDoc.set(s.documentId, a) }
    for (const [docId, list] of byDoc) {
      const pos = list.reduce((n, s) => n + s.positive, 0)
      const cnt = list.reduce((n, s) => n + s.counter, 0)
      const sub = substanceRatio(pos, cnt)
      if (sub === null) continue
      const totalLen = list.reduce((n, s) => n + s.text.length, 0) || 1
      const tone = list.reduce((n, s) => n + s.tone * s.text.length, 0) / totalLen
      raws.push({ id: docId, label: list[0].documentLabel, documentId: docId,
        documentLabel: list[0].documentLabel, substance: sub, tone, weight: 1 })
    }
  } else {
    // keyword level is assembled in computeGap() (it needs the keyword list
    // + synonyms in scope). Guard here so buildPoints only handles the two
    // aggregate levels.
    return []
  }

  // reference line
  let line: { slope: number; intercept: number } | null = null
  if (reference === 'residual' && raws.length >= RESIDUAL_MIN_POINTS) {
    line = fitLine(raws.map((r) => ({ substance: r.substance, tone: r.tone })))
  }
  return raws.map((r) => ({
    ...r,
    gap: line ? gapFromResidual(r.tone, r.substance, line) : gapFromDiagonal(r.tone, r.substance),
  }))
}
```

NOTE: keyword-level is built inside `computeGap` (next step) where keywords + synonyms are in scope; `buildPoints` returns `[]` for the keyword level.

- [ ] **Step 2: Add computeGap (the public entry point)**

```ts
export interface ComputeGapInput {
  projectId: string
  keywordListId: string
  reference: GapReference
}

export async function computeGap(input: ComputeGapInput): Promise<GapDataset> {
  const docRows = await selectAll<DocumentRow>('documents.byProject', [input.projectId])
  const docs = docRows.map(rowToDocument).filter((d) => d.extractedText && d.extractedText.length > 0)
  const keywords = (await listKeywords(input.keywordListId)).filter((k) => k.enabled)
  const synByKw = await listEnabledSynonymsForKeywords(keywords.map((k) => k.id))

  const secs = await buildSections(docs, keywords)
  await fillSectionTones(input.projectId, secs)

  // keyword-level points: per (doc, keyword) freq + avg section tone
  const kwPoints: GapPoint[] = []
  {
    type Acc = { polarity: 1 | -1; freq: number; toneWeighted: number; text: string; documentId: string; documentLabel: string }
    const acc = new Map<string, Acc>()
    for (const s of secs) {
      for (const kw of keywords) {
        const terms = [kw.text, ...(synByKw.get(kw.id) ?? [])]
        const n = findConceptSpans(s.text, terms).length
        if (n === 0) continue
        const key = `${s.documentId}:${kw.id}`
        const a = acc.get(key) ?? { polarity: kw.polarity === 'counter' ? -1 : 1, freq: 0, toneWeighted: 0, text: kw.text, documentId: s.documentId, documentLabel: s.documentLabel }
        a.freq += n
        a.toneWeighted += s.tone * n
        acc.set(key, a)
      }
    }
    for (const [key, a] of acc) {
      const tone = a.freq > 0 ? a.toneWeighted / a.freq : 0
      const substance = a.polarity
      kwPoints.push({
        id: key, label: `${a.text} · ${a.documentLabel}`, documentId: a.documentId,
        documentLabel: a.documentLabel, substance, tone, weight: a.freq,
        gap: gapFromDiagonal(tone, substance),
      })
    }
  }

  const byLevel: Record<GapLevel, GapPoint[]> = {
    document: buildPoints(secs, docs, 'document', input.reference),
    section: buildPoints(secs, docs, 'section', input.reference),
    keyword: kwPoints,
  }

  // over-time: average document-level gap per year
  const docYear = new Map(docs.map((d) => [d.id, d.year]))
  const byYear = new Map<number, { sum: number; count: number }>()
  for (const p of byLevel.document) {
    const y = docYear.get(p.documentId)
    if (y == null) continue
    const b = byYear.get(y) ?? { sum: 0, count: 0 }
    b.sum += p.gap; b.count += 1; byYear.set(y, b)
  }
  const overTime = [...byYear.entries()]
    .map(([year, b]) => ({ year, avgGap: b.sum / b.count, count: b.count }))
    .sort((a, b) => a.year - b.year)

  return {
    byLevel,
    overTime,
    overTimeAvailable: overTime.length >= 2,
    singleDocument: docs.length <= 1,
  }
}
```

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build:vite`
Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add src/services/gap.ts
git commit -m "feat(gap): assemble per-level datasets + over-time aggregation"
```

---

## Task 8: GapScatter component

**Files:**
- Create: `src/components/gap/GapScatter.tsx`

- [ ] **Step 1: Implement the scatter**

Uses recharts (already used elsewhere). Tabs switch level; `ZAxis` encodes keyword frequency as dot size; per-document color; diagonal `ReferenceLine`; quadrant labels via `Label`.
```tsx
import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { GapDataset, GapLevel, GapPoint } from '@/services/gap'

const DOC_COLORS = ['#16a085', '#e67e22', '#8e44ad', '#2980b9', '#c0392b', '#27ae60', '#f39c12', '#2c3e50']

interface Props {
  data: GapDataset
  level: GapLevel
  onLevelChange: (l: GapLevel) => void
}

export function GapScatter({ data, level, onLevelChange }: Props) {
  const points = data.byLevel[level]
  const docColor = useMemo(() => {
    const ids = [...new Set(points.map((p) => p.documentId))]
    return new Map(ids.map((id, i) => [id, DOC_COLORS[i % DOC_COLORS.length]]))
  }, [points])

  const byDoc = useMemo(() => {
    const m = new Map<string, GapPoint[]>()
    for (const p of points) { const a = m.get(p.documentId) ?? []; a.push(p); m.set(p.documentId, a) }
    return [...m.entries()]
  }, [points])

  const levels: GapLevel[] = data.singleDocument ? ['section', 'keyword'] : ['document', 'section', 'keyword']

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {levels.map((l) => (
          <button key={l} type="button" onClick={() => onLevelChange(l)}
            className={`text-sm px-3 py-1 rounded-full border ${l === level ? 'border-foreground text-foreground' : 'border-border text-muted-foreground'}`}>
            {l === 'document' ? 'Document' : l === 'section' ? 'Section' : 'Keyword (hits only)'}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="substance" name="Substance" domain={[-1, 1]}
            label={{ value: 'substance (delivery →)', position: 'bottom' }} />
          <YAxis type="number" dataKey="tone" name="Tone" domain={[-1, 1]}
            label={{ value: 'tone', angle: -90, position: 'left' }} />
          <ZAxis type="number" dataKey="weight" range={[40, 400]} name="matches" />
          <ReferenceLine segment={[{ x: -1, y: -1 }, { x: 1, y: 1 }]} stroke="#bbb" strokeDasharray="5 5" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, n: string) => [v.toFixed(2), n]}
            labelFormatter={() => ''}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as GapPoint | undefined
              if (!p) return null
              return (
                <div className="bg-card border border-border rounded px-2 py-1 text-xs">
                  <div className="font-medium">{p.label}</div>
                  <div>tone {p.tone.toFixed(2)} · substance {p.substance.toFixed(2)}</div>
                  <div>gap {p.gap >= 0 ? '+' : ''}{p.gap.toFixed(2)}{p.gap > 0.4 ? ' — performative' : ''}</div>
                </div>
              )
            }} />
          {byDoc.map(([docId, pts]) => (
            <Scatter key={docId} data={pts} fill={docColor.get(docId)} fillOpacity={0.75} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground mt-2">
        Top-left (high tone, low substance) = performative. Distance above the dashed diagonal = greenwashing intensity.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build:vite`
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add src/components/gap/GapScatter.tsx
git commit -m "feat(gap): scatter explorer component"
```

---

## Task 9: GapOverTime component

**Files:**
- Create: `src/components/gap/GapOverTime.tsx`

- [ ] **Step 1: Implement the trend line**

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { GapDataset } from '@/services/gap'

export function GapOverTime({ data }: { data: GapDataset }) {
  if (!data.overTimeAvailable) {
    return (
      <p className="text-sm text-muted-foreground italic border border-dashed border-border rounded-md p-4">
        Gap-over-time needs documents spanning at least two years. Add years to more documents (Library) to see the trend.
      </p>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data.overTime} margin={{ top: 16, right: 30, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis domain={[-2, 2]} label={{ value: 'avg gap', angle: -90, position: 'left' }} />
        <ReferenceLine y={0} stroke="#bbb" />
        <Tooltip formatter={(v: number) => [(v as number).toFixed(2), 'avg gap']} />
        <Line type="monotone" dataKey="avgGap" stroke="#c0392b" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build:vite`
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add src/components/gap/GapOverTime.tsx
git commit -m "feat(gap): over-time trend component with sufficiency guard"
```

---

## Task 10: Gap page

**Files:**
- Create: `src/pages/workflow/Gap.tsx`

- [ ] **Step 1: Implement the page**

Mirrors Read.tsx structure (useOutletContext) and the backend-required gate. Provides the normalization toggle and the coarse-signal caveat.
```tsx
import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { computeGap, type GapDataset, type GapLevel } from '@/services/gap'
import type { GapReference } from '@/services/_shared/gap-math'
import { GapScatter } from '@/components/gap/GapScatter'
import { GapOverTime } from '@/components/gap/GapOverTime'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

const RESIDUAL_MIN_POINTS = 8

export function Gap() {
  const vm = useOutletContext<ProjectViewModel>()
  const [data, setData] = useState<GapDataset | null>(null)
  const [level, setLevel] = useState<GapLevel>('document')
  const [reference, setReference] = useState<GapReference>('diagonal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vm.keywordList) return
    let cancelled = false
    setLoading(true); setError(null)
    computeGap({ projectId: vm.project.id, keywordListId: vm.keywordList.id, reference })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vm.project.id, vm.keywordList, reference])

  // single-doc projects start on the section tab
  useEffect(() => { if (data?.singleDocument && level === 'document') setLevel('section') }, [data, level])

  const residualReady = useMemo(
    () => data ? data.byLevel[level].length >= RESIDUAL_MIN_POINTS : false,
    [data, level]
  )

  if (!vm.keywordList) {
    return <div className="px-8 py-10"><EmptyState title="No keyword list"
      description="Pick a keyword list on the Setup tab — the gap needs keywords to measure substance." /></div>
  }
  if (error) {
    return <div className="px-8 py-10"><EmptyState title="Analysis engine required"
      description="The Gap view needs the bundled analysis engine for sentiment. Check the status indicator in the top bar (Settings → Backend to restart), then reopen this tab." /></div>
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-medium tracking-tight">Gap</h1>
        <p className="text-muted-foreground italic mt-1">Where does the tone run ahead of the substance?</p>
      </header>

      <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground mb-6">
        Sentiment is a coarse signal — treat the gap as a way to find passages worth reading, not a verdict.
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Reference line:</span>
        <button type="button" onClick={() => setReference('diagonal')}
          className={`text-sm px-3 py-1 rounded-full border ${reference === 'diagonal' ? 'border-foreground' : 'border-border text-muted-foreground'}`}>Absolute (diagonal)</button>
        <button type="button" disabled={!residualReady} onClick={() => setReference('residual')}
          title={residualReady ? '' : `Needs ≥ ${RESIDUAL_MIN_POINTS} points`}
          className={`text-sm px-3 py-1 rounded-full border disabled:opacity-40 ${reference === 'residual' ? 'border-foreground' : 'border-border text-muted-foreground'}`}>Relative to corpus</button>
      </div>

      {loading || !data ? (
        <div className="text-sm text-muted-foreground py-8">Analysing…</div>
      ) : (
        <>
          <GapScatter data={data} level={level} onLevelChange={setLevel} />
          <section className="mt-10">
            <h2 className="font-display text-lg font-medium mb-3">Gap over time</h2>
            <GapOverTime data={data} />
          </section>
        </>
      )}
    </div>
  )
}
```

The page treats a failed `computeGap` (sentiment unreachable) as the backend-required empty state via the `catch` — no new api export needed.

- [ ] **Step 2: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build:vite`
Expected: clean.

- [ ] **Step 3: Commit**
```bash
git add src/pages/workflow/Gap.tsx
git commit -m "feat(gap): Gap workflow page with backend-required gate + caveat"
```

---

## Task 11: Wire nav + route

**Files:**
- Modify: `src/components/project/WorkflowTabs.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the tab**

In `WorkflowTabs.tsx` `TABS`, insert after the `audit` entry:
```ts
  { to: 'gap', label: 'Gap', requiresSetup: true },
```

- [ ] **Step 2: Add the lazy import + route**

In `App.tsx`, after the `Audit` lazy import:
```ts
const Gap = lazy(() => import('./pages/workflow/Gap').then(m => ({ default: m.Gap })))
```
And after the `audit` route:
```tsx
            <Route path="gap" element={<Gap />} />
```
Update the `// Project workspace + 9 workflow tabs` comment to `10`.

- [ ] **Step 3: Verify build + manual smoke**

Run: `npm run build:vite`
Then run the app (`npm run dev`), open a project with the dev backend running, click the Gap tab.
Expected: tab appears after Audit; Gap view loads; scatter renders with document points; switching tabs (Document/Section/Keyword) works; with the backend stopped, the "Analysis engine required" state shows.

- [ ] **Step 4: Commit**
```bash
git add src/components/project/WorkflowTabs.tsx src/App.tsx
git commit -m "feat(gap): wire Gap tab into workflow nav + routing"
```

---

## Task 12: Documentation (3 places)

**Files:**
- Modify: `src/data/frameworks/KEYWORD_METHODOLOGY.md`
- Modify: `src/pages/Help.tsx`
- Modify: `docs/design/user-stories.md`

- [ ] **Step 1: Methodology doc**

Append a "Tone–Substance Gap" section containing the verbatim rationale + quadrant table from `.superpowers/brainstorm/82864-1779343776/rationale-note.md` (also reproduced in the spec §1).

- [ ] **Step 2: In-app Help**

Add a Gap help section in `src/pages/Help.tsx` with: the one-line purpose, the quadrant table (as a small HTML table), the polarity-vs-sentiment distinction, and the coarse-signal caveat. Follow the existing Help section markup in that file.

- [ ] **Step 3: user-stories.md**

Update the US-C-02 row and the Implementation status section: US-C-02 is now implemented as the Tone–Substance Gap (reframed from "sentiment over time"). Move it out of "Not yet built".

- [ ] **Step 4: Commit**
```bash
git add src/data/frameworks/KEYWORD_METHODOLOGY.md src/pages/Help.tsx docs/design/user-stories.md
git commit -m "docs(gap): methodology rationale, in-app Help, US-C-02 reconciliation"
```

---

## Task 13: Manual validation + final checks

- [ ] **Step 1: Full local gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build:vite`
Expected: all green.

- [ ] **Step 2: Validate the metric on real docs**

With the dev backend running, open Gap on the sample corpus. Confirm:
- points land in plausible quadrants (most corporate text high-tone),
- open 2–3 points with a large positive gap and read the section — confirm it reads as upbeat-but-hollow before trusting the ranking,
- keyword tab shows counter-keywords skewing high-tone (the fingerprint),
- over-time line appears only when ≥2 years have docs,
- caching: reopening the tab is instant (no second backend pause).

- [ ] **Step 3: Record validation outcome**

If the signal looks wrong (e.g., everything clusters on the diagonal / sentiment uniformly 0), note it — the metric may need per-sentence tone (deferred refinement) before release. Otherwise proceed.

---

## Self-review notes

- **Spec coverage:** §2 metric → Tasks 2,5,7; §3 sentiment/cache → Tasks 4,6; §4 architecture → Tasks 5–11; §5 views → Tasks 8,9,10; §6 offline/empty → Task 10; §7 docs → Task 12; §8 validation → Tasks 2,3,13. All covered.
- **Keyword-level** substance=polarity, size=frequency handled in `computeGap` (Task 7) + `ZAxis` (Task 8).
- **Type consistency:** `GapDataset`, `GapPoint`, `GapLevel`, `GapReference`, `computeGap` names used consistently across Tasks 7–10.
